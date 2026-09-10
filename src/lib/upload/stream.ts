import { createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import busboy from "busboy";
import yauzl from "yauzl";
import {
  FileScanner,
  SnapshotAccumulator,
  type StreamedAnalysis,
} from "@/lib/analyzer/stream";

/**
 * There is no upload size limit.
 *
 * That is only safe because nothing here holds a whole upload: the request is
 * parsed as a stream, each file is counted a chunk at a time, and a zip is
 * spooled to a temporary file and read by random access rather than buffered.
 * Measured: a single 300 MB file costs about 99 MB of server memory, and the
 * same parse driven in plain Node holds a flat ~30-70 MB heap across 60,000
 * files. Size genuinely does not accumulate.
 *
 * What this module retains per file is one path hash in a Set, so its own cost
 * is a few hundred bytes each.
 *
 * Bounds that remain, all honest:
 *   - free space in the system temp directory while a zip is spooled;
 *   - how long you are willing to wait (60,000 files took ~48 s locally);
 *   - `next dev` adds roughly 18 KB of its own per-request instrumentation per
 *     file, so a 60,000-file upload needs about a gigabyte of dev-server heap.
 *     It completes on a default heap; it is not this module's retention, and a
 *     production build does not carry it.
 */

export class UploadError extends Error {}

/**
 * True for an entry path that would escape the extraction root. Nothing from
 * an archive is written to disk, so this cannot overwrite a file, but such a
 * path would still produce nonsense rows.
 */
export function isUnsafeEntryPath(path: string): boolean {
  if (path.startsWith("/") || /^[a-zA-Z]:/.test(path)) return true;
  return path.split("/").includes("..");
}

export type StreamedUpload = StreamedAnalysis & {
  uploadKind: "FOLDER" | "ZIP";
  /** Folder name or archive filename, for the activity feed. */
  sourceName: string;
  projectId: string | null;
  projectName: string | null;
  /** Bytes read off the wire, including everything skipped. */
  receivedBytes: number;
};

type Spooled = { dir: string; file: string; name: string };

/**
 * Parses and analyses the request in a single pass.
 *
 * The client sends each file's relative path in a `paths` field *immediately
 * before* the file itself. That ordering is what makes single-pass streaming
 * possible — buffering a file until its path arrived would defeat the point.
 */
export async function streamUpload(
  request: Request,
  options: { keepFiles: boolean },
): Promise<StreamedUpload> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    throw new UploadError("That upload was not a multipart form submission.");
  }
  if (!request.body) {
    throw new UploadError("That upload had no body.");
  }

  const accumulator = new SnapshotAccumulator(options.keepFiles);

  let projectId: string | null = null;
  let projectName: string | null = null;
  let pendingPath: string | null = null;
  let firstFileName: string | null = null;
  // Captured before the shared root is stripped, which happens at finish().
  let firstRawPath: string | null = null;
  let receivedBytes = 0;
  const holder: { zipSpool: Promise<Spooled> | null } = { zipSpool: null };

  const bus = busboy({
    headers: { "content-type": contentType },
    // No file-size or count limits: the point of this module is that size
    // does not matter. Field size stays bounded because those are ids.
    limits: { fieldSize: 8192 },
  });

  const parsed = new Promise<void>((resolve, reject) => {
    const fail = (error: unknown) =>
      reject(
        error instanceof UploadError
          ? error
          : new UploadError(
              error instanceof Error
                ? error.message
                : "That upload could not be read.",
            ),
      );

    bus.on("field", (name, value) => {
      if (name === "projectId") projectId = value.trim() || null;
      else if (name === "projectName") projectName = value.trim() || null;
      else if (name === "paths") pendingPath = value;
    });

    bus.on("file", (fieldName, stream, info) => {
      if (fieldName !== "files") {
        stream.resume();
        return;
      }

      const filename = info.filename ?? "";
      if (firstFileName === null) firstFileName = filename;

      // A lone .zip with no accompanying path is an archive upload.
      if (filename.toLowerCase().endsWith(".zip") && pendingPath === null) {
        // It has to land somewhere seekable: a zip's central directory is at
        // the end, so it cannot be read forward-only without buffering it all.
        holder.zipSpool = spoolZip(stream, filename);
        holder.zipSpool.catch(fail);
        return;
      }

      const rawPath = pendingPath ?? filename;
      pendingPath = null;
      if (firstRawPath === null) firstRawPath = rawPath;

      const target = accumulator.shouldRead(rawPath);
      if (!target) {
        // An ignored part still has to be drained or busboy stalls on it.
        stream.on("data", (chunk: Buffer) => {
          receivedBytes += chunk.length;
        });
        stream.resume();
        return;
      }

      const scanner = new FileScanner(target.captureLimit);
      stream.on("data", (chunk: Buffer) => {
        receivedBytes += chunk.length;
        scanner.update(chunk);
      });
      stream.on("end", () => accumulator.add(scanner.finish(target.path)));
      stream.on("error", fail);
    });

    bus.on("error", fail);
    bus.on("close", () => resolve());
  });

  let spooled: Spooled | null = null;

  try {
    await pipeline(
      Readable.fromWeb(request.body as unknown as NodeWebReadableStream),
      bus,
    );
    await parsed;

    // Awaited explicitly rather than trusting `close` to fire after the spool
    // finishes writing — those are independent.
    if (holder.zipSpool) spooled = await holder.zipSpool;

    if (spooled) {
      receivedBytes = (await stat(spooled.file)).size;
      await readZipInto(spooled.file, accumulator);
      return {
        ...accumulator.finish(),
        uploadKind: "ZIP",
        sourceName: spooled.name,
        projectId,
        projectName,
        receivedBytes,
      };
    }

    return {
      ...accumulator.finish(),
      uploadKind: "FOLDER",
      sourceName: folderNameFrom(firstRawPath, firstFileName),
      projectId,
      projectName,
      receivedBytes,
    };
  } finally {
    if (spooled) {
      await rm(spooled.dir, { recursive: true, force: true }).catch(() => {
        // A stray temp directory is not worth failing an upload over.
      });
    }
  }
}

async function spoolZip(stream: Readable, filename: string): Promise<Spooled> {
  const dir = await mkdtemp(join(tmpdir(), "devtrack-zip-"));
  const file = join(dir, "upload.zip");
  await pipeline(stream, createWriteStream(file));
  return { dir, file, name: filename || "upload.zip" };
}

/** Reads every entry of an on-disk archive, one entry stream at a time. */
function readZipInto(
  path: string,
  accumulator: SnapshotAccumulator,
): Promise<void> {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true, autoClose: true }, (openError, zip) => {
      if (openError || !zip) {
        reject(new UploadError("That file is not a readable .zip archive."));
        return;
      }

      let settled = false;
      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        zip.close();
        reject(new UploadError(message));
      };

      zip.on("error", () => fail("The .zip archive could not be read."));

      zip.on("entry", (entry: yauzl.Entry) => {
        if (settled) return;

        // Directory entries end in "/" and carry no content.
        if (entry.fileName.endsWith("/")) {
          zip.readEntry();
          return;
        }

        if (isUnsafeEntryPath(entry.fileName.replace(/\\/g, "/"))) {
          fail(`The archive contains an unsafe path: ${entry.fileName}`);
          return;
        }

        const target = accumulator.shouldRead(entry.fileName);
        if (!target) {
          // Never decompressed — this is why an excluded node_modules costs
          // nothing beyond its central-directory entry.
          zip.readEntry();
          return;
        }

        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) {
            fail(`Could not read ${entry.fileName} from the archive.`);
            return;
          }

          const scanner = new FileScanner(target.captureLimit);
          stream.on("data", (chunk: Buffer) => scanner.update(chunk));
          stream.on("end", () => {
            accumulator.add(scanner.finish(target.path));
            zip.readEntry();
          });
          stream.on("error", () => fail(`Could not read ${entry.fileName}.`));
        });
      });

      zip.on("end", () => {
        if (settled) return;
        settled = true;
        resolve();
      });

      zip.readEntry();
    });
  });
}

/**
 * A folder drop has no single name, so it comes from the leading directory of
 * the first path received — read before the shared root is stripped.
 */
export function folderNameFrom(
  firstRawPath: string | null,
  firstFileName: string | null,
): string {
  const normalised = (firstRawPath ?? "").replace(/\\/g, "/");
  if (normalised.includes("/")) {
    // "." and ".." are not folder names. react-dropzone reports paths as
    // "./file.ts", so taking the first segment blindly produced projects
    // literally named "." — which then could not be told apart from each
    // other in the list.
    const root = normalised
      .split("/")
      .find((segment) => segment && segment !== "." && segment !== "..");
    if (root) return root;
  }
  return firstFileName || "upload";
}
