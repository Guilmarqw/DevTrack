import yauzl from "yauzl";
import { normalizePath } from "@/lib/analyzer/exclude";
import type { RawEntry } from "@/lib/analyzer/analyze";

export const UPLOAD_LIMITS = {
  /** Total uncompressed bytes read out of an archive. */
  maxTotalBytes: 256 * 1024 * 1024,
  /** Entries inspected, counting the ones later excluded. */
  maxEntries: 50_000,
  /** Per-file ceiling; anything larger is not hand-written source. */
  maxFileBytes: 8 * 1024 * 1024,
};

export class UploadError extends Error {}

/**
 * True for an entry path that would escape the extraction root — "../" or an
 * absolute path or a Windows drive letter. Nothing here is written to disk, so
 * this cannot overwrite a file, but such a path would still produce nonsense
 * rows and it is a bug either way.
 */
export function isUnsafeEntryPath(path: string): boolean {
  if (path.startsWith("/") || /^[a-zA-Z]:/.test(path)) return true;
  return path.split("/").includes("..");
}

/**
 * Archives almost always wrap everything in one directory named after the
 * project. Stripping it keeps paths comparable with a folder upload of the
 * same tree — otherwise re-uploading the same project as a zip would look
 * like every file moved.
 */
export function stripCommonRoot(entries: RawEntry[]): RawEntry[] {
  if (entries.length === 0) return entries;

  const firstSegments = entries.map((e) => e.path.split("/")[0]);
  const root = firstSegments[0];

  // Only strip when every entry shares the prefix and something remains after.
  const shared =
    root &&
    firstSegments.every((segment) => segment === root) &&
    entries.every((e) => e.path.length > root.length + 1);

  if (!shared) return entries;

  return entries.map((entry) => ({
    ...entry,
    path: entry.path.slice(root.length + 1),
  }));
}

/** Reads every file entry from a .zip held in memory. */
export function readZip(buffer: Buffer): Promise<RawEntry[]> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (openError, zipfile) => {
      if (openError || !zipfile) {
        reject(new UploadError("That file is not a readable .zip archive."));
        return;
      }

      const entries: RawEntry[] = [];
      let totalBytes = 0;
      let entryCount = 0;
      let settled = false;

      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        zipfile.close();
        reject(new UploadError(message));
      };

      zipfile.on("error", () => fail("The .zip archive could not be read."));

      zipfile.on("entry", (entry: yauzl.Entry) => {
        if (settled) return;

        entryCount += 1;
        if (entryCount > UPLOAD_LIMITS.maxEntries) {
          fail(
            `That archive has more than ${UPLOAD_LIMITS.maxEntries.toLocaleString()} entries.`,
          );
          return;
        }

        const path = normalizePath(entry.fileName);

        // Directory entries end in "/" and carry no content.
        if (!path || entry.fileName.endsWith("/")) {
          zipfile.readEntry();
          return;
        }

        if (isUnsafeEntryPath(path)) {
          fail(`The archive contains an unsafe path: ${entry.fileName}`);
          return;
        }

        // uncompressedSize is from the archive's own header, so treat it as a
        // hint for skipping; the real size is enforced while reading below.
        if (entry.uncompressedSize > UPLOAD_LIMITS.maxFileBytes) {
          zipfile.readEntry();
          return;
        }

        zipfile.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) {
            fail(`Could not read ${entry.fileName} from the archive.`);
            return;
          }

          const chunks: Buffer[] = [];
          let size = 0;
          let aborted = false;

          stream.on("data", (chunk: Buffer) => {
            if (aborted) return;
            size += chunk.length;
            totalBytes += chunk.length;

            // A lying header is the classic zip bomb, so stop on real bytes.
            if (size > UPLOAD_LIMITS.maxFileBytes) {
              aborted = true;
              stream.destroy();
              return;
            }
            if (totalBytes > UPLOAD_LIMITS.maxTotalBytes) {
              aborted = true;
              stream.destroy();
              fail("That archive expands to more than 256 MB.");
              return;
            }
            chunks.push(chunk);
          });

          stream.on("end", () => {
            if (settled) return;
            // `aborted` means the file blew its own limit; skip just that file.
            if (!aborted) {
              entries.push({ path, content: Buffer.concat(chunks) });
            }
            zipfile.readEntry();
          });

          stream.on("error", () => fail(`Could not read ${entry.fileName}.`));
        });
      });

      zipfile.on("end", () => {
        if (settled) return;
        settled = true;
        resolve(stripCommonRoot(entries));
      });

      zipfile.readEntry();
    });
  });
}
