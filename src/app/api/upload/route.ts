import { NextResponse } from "next/server";
import { getSessionUser, projectScope, type SessionUser } from "@/lib/session";
import { db } from "@/lib/db";
import { streamUpload, UploadError } from "@/lib/upload/stream";
import { createSnapshot } from "@/lib/upload/snapshot";

export const runtime = "nodejs";
/**
 * There is no upload size limit, so there cannot be a useful time limit
 * either — a large repository legitimately takes minutes. 0 disables the cap
 * rather than guessing a number that would kill a valid scan half way.
 */
export const maxDuration = 0;

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // A re-scan names its target in the query string, not the body, so it can
  // be read without consuming the stream. This is the authoritative source:
  // reading it from a body field would mean waiting for the whole upload to
  // find out which project it belongs to.
  const targetProjectId =
    new URL(request.url).searchParams.get("projectId")?.trim() || null;

  try {
    // Whether per-file rows are kept has to be known before parsing, because
    // it decides whether the stream retains a row per file or only totals.
    const keepFiles = targetProjectId
      ? await projectTracksFiles(targetProjectId, user)
      : false;

    const upload = await streamUpload(request, { keepFiles });

    if (upload.analysis.totalFiles === 0) {
      return NextResponse.json(
        {
          error:
            "No countable source files were found. Everything was a build artefact, a binary, or empty.",
        },
        { status: 400 },
      );
    }

    const summary = await createSnapshot({
      user,
      // The query string wins. `upload.projectId` is only the legacy body
      // field, kept as a fallback; without this a re-scan silently created a
      // brand-new project named after the first file it saw.
      projectId: targetProjectId ?? upload.projectId ?? undefined,
      projectName: upload.projectName ?? upload.sourceName,
      uploadKind: upload.uploadKind,
      sourceName: upload.sourceName,
      analysis: upload.analysis,
      dependencies: upload.dependencies,
      detected: upload.detected,
      findings: upload.findings,
    });

    return NextResponse.json(
      { ...summary, receivedBytes: upload.receivedBytes },
      { status: 201 },
    );
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
 * Peeks at the target project's `trackFiles` before the body is read.
 *
 * The project id arrives in the query string for a re-scan precisely so this
 * can be answered without consuming the stream — reading it from the body
 * would mean buffering, which is the thing this whole path exists to avoid.
 * A new project has no rows yet, so it defaults to off.
 */
async function projectTracksFiles(
  projectId: string,
  user: SessionUser,
): Promise<boolean> {
  const project = await db.project.findFirst({
    where: { id: projectId, ...projectScope(user) },
    select: { trackFiles: true },
  });

  return project?.trackFiles ?? false;
}
