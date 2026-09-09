import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { normalizePath } from "@/lib/analyzer/exclude";
import type { RawEntry } from "@/lib/analyzer/analyze";
import { readZip, stripCommonRoot, UPLOAD_LIMITS, UploadError } from "@/lib/upload/zip";
import { createSnapshot } from "@/lib/upload/snapshot";
import type { UploadKind } from "@/generated/prisma/enums";

// Uploads are parsed with the runtime's own multipart handling via
// request.formData(). That buffers the whole request in memory, which is fine
// for a source tree on localhost and avoids bolting a Node-stream parser onto
// a Web Request. The limits below are what keep that honest.
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "That upload could not be read as a form submission." },
      { status: 400 },
    );
  }

  const projectId = stringField(form, "projectId");
  const projectName = stringField(form, "projectName");
  const files = form.getAll("files").filter(isFile);

  if (files.length === 0) {
    return NextResponse.json({ error: "No files were uploaded." }, { status: 400 });
  }
  if (files.length > UPLOAD_LIMITS.maxEntries) {
    return NextResponse.json(
      { error: `That is more than ${UPLOAD_LIMITS.maxEntries.toLocaleString()} files.` },
      { status: 413 },
    );
  }

  const declaredBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (declaredBytes > UPLOAD_LIMITS.maxTotalBytes) {
    return NextResponse.json(
      { error: "That upload is larger than 256 MB." },
      { status: 413 },
    );
  }

  const singleZip =
    files.length === 1 && files[0].name.toLowerCase().endsWith(".zip");

  try {
    let entries: RawEntry[];
    let uploadKind: UploadKind;
    let sourceName: string;

    if (singleZip) {
      const buffer = Buffer.from(await files[0].arrayBuffer());
      entries = await readZip(buffer);
      uploadKind = "ZIP";
      sourceName = files[0].name;

      if (entries.length === 0) {
        return NextResponse.json(
          { error: "That archive is empty." },
          { status: 400 },
        );
      }
    } else {
      entries = await readFolderEntries(form, files);
      uploadKind = "FOLDER";
      sourceName = folderName(entries) ?? "upload";
      // A folder drop arrives with the containing directory in every path;
      // drop it for the same reason a zip's wrapper directory is dropped.
      entries = stripCommonRoot(entries);
    }

    const summary = await createSnapshot({
      user,
      projectId: projectId || undefined,
      projectName: projectName || sourceName,
      uploadKind,
      sourceName,
      entries,
    });

    return NextResponse.json(summary, { status: 201 });
  } catch (error) {
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Upload failed:", error);
    return NextResponse.json(
      { error: "Something went wrong while processing that upload." },
      { status: 500 },
    );
  }
}

/**
 * A folder drop sends one part per file. The browser's own relative path is in
 * webkitRelativePath, which does not survive FormData, so the client sends a
 * parallel `paths` field — one entry per file, in the same order.
 */
async function readFolderEntries(
  form: FormData,
  files: File[],
): Promise<RawEntry[]> {
  const declaredPaths = form.getAll("paths").map(String);
  const entries: RawEntry[] = [];

  for (const [index, file] of files.entries()) {
    if (file.size > UPLOAD_LIMITS.maxFileBytes) continue;

    // Fall back to the bare filename when the client sent no path for this
    // slot, rather than silently pairing a file with someone else's path.
    const declared = declaredPaths[index];
    const path = normalizePath(
      declared && declared.length > 0 ? declared : file.name,
    );
    if (!path) continue;

    entries.push({
      path,
      content: Buffer.from(await file.arrayBuffer()),
    });
  }

  return entries;
}

function folderName(entries: RawEntry[]): string | null {
  const first = entries[0]?.path;
  if (!first) return null;
  const segments = first.split("/");
  return segments.length > 1 ? segments[0] : null;
}

function stringField(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function isFile(value: FormDataEntryValue): value is File {
  return typeof value === "object" && value !== null && "arrayBuffer" in value;
}
