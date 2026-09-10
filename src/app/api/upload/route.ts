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

  try {
    // Whether per-file rows are kept has to be known before parsing, because
    // it decides whether the stream retains a row per file or only totals.
    const keepFiles = await projectTracksFiles(request, user);

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
      projectId: upload.projectId ?? undefined,
      projectName: upload.projectName ?? upload.sourceName,
      uploadKind: upload.uploadKind,
      sourceName: upload.sourceName,
      analysis: upload.analysis,
      dependencies: upload.dependencies,
      detected: upload.detected,
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
  request: Request,
  user: SessionUser,
): Promise<boolean> {
  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId) return false;

  const project = await db.project.findFirst({
    where: { id: projectId, ...projectScope(user) },
    select: { trackFiles: true },
  });

  return project?.trackFiles ?? false;
}
