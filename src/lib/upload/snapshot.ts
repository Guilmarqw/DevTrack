import { db } from "@/lib/db";
import { analyze, type RawEntry } from "@/lib/analyzer/analyze";
import { computeCompletion } from "@/lib/completion";
import { UploadError } from "./zip";
import type { SessionUser } from "@/lib/session";
import type { UploadKind } from "@/generated/prisma/enums";

/** MariaDB is happier with several medium inserts than one enormous one. */
const INSERT_CHUNK = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export type SnapshotRequest = {
  user: SessionUser;
  /** Given for a re-scan; omitted to create a new project. */
  projectId?: string;
  /** Used when creating a project. */
  projectName?: string;
  uploadKind: UploadKind;
  sourceName: string;
  entries: RawEntry[];
};

export type SnapshotSummary = {
  projectId: string;
  projectName: string;
  snapshotId: string;
  isNewProject: boolean;
  totalFiles: number;
  totalLines: number;
  totalBytes: number;
  languages: Array<{ language: string; bytes: number; lines: number }>;
  skipped: { excluded: number; binary: number; empty: number };
};

export async function createSnapshot(
  request: SnapshotRequest,
): Promise<SnapshotSummary> {
  const analysis = analyze(request.entries);

  if (analysis.totalFiles === 0) {
    throw new UploadError(
      "No countable source files were found. Everything was a build artefact, a binary, or empty.",
    );
  }

  // Resolve the target project before opening the transaction, so an
  // authorization failure never leaves a half-written snapshot.
  const project = request.projectId
    ? await loadProjectForRescan(request.projectId, request.user)
    : null;

  if (project) {
    return writeSnapshot({
      request,
      analysis,
      project,
      isNewProject: false,
    });
  }

  const name = (request.projectName ?? "").trim();
  if (!name) throw new UploadError("A project name is required.");
  if (name.length > 191) throw new UploadError("That project name is too long.");

  const duplicate = await db.project.findFirst({
    where: { ownerId: request.user.id, name },
    select: { id: true },
  });
  if (duplicate) {
    throw new UploadError(
      `You already have a project called "${name}". Re-upload it from its own page to add a snapshot.`,
    );
  }

  const created = await db.project.create({
    data: { name, ownerId: request.user.id },
    select: {
      id: true,
      name: true,
      completionMode: true,
      manualCompletionPct: true,
      trackFiles: true,
    },
  });

  return writeSnapshot({
    request,
    analysis,
    project: { ...created, tasks: [] },
    isNewProject: true,
  });
}

type TargetProject = {
  id: string;
  name: string;
  completionMode: "TASKS" | "MANUAL";
  manualCompletionPct: number;
  trackFiles: boolean;
  tasks: Array<{ status: "TODO" | "IN_PROGRESS" | "DONE"; weight: number }>;
};

async function loadProjectForRescan(
  projectId: string,
  user: SessionUser,
): Promise<TargetProject> {
  const project = await db.project.findFirst({
    // Admins may re-scan anyone's project; everyone else only their own. A
    // non-owner gets "not found" rather than "forbidden" so this does not
    // confirm that someone else's project exists.
    where: {
      id: projectId,
      ...(user.role === "ADMIN" ? {} : { ownerId: user.id }),
    },
    select: {
      id: true,
      name: true,
      completionMode: true,
      manualCompletionPct: true,
      trackFiles: true,
      tasks: { select: { status: true, weight: true } },
    },
  });

  if (!project) throw new UploadError("That project does not exist.");
  return project;
}

async function writeSnapshot({
  request,
  analysis,
  project,
  isNewProject,
}: {
  request: SnapshotRequest;
  analysis: ReturnType<typeof analyze>;
  project: TargetProject;
  isNewProject: boolean;
}): Promise<SnapshotSummary> {
  const completionPct = computeCompletion(project, project.tasks);
  const source = isNewProject ? "UPLOAD" : "RESCAN";

  const snapshotId = await db.$transaction(async (tx) => {
    const snapshot = await tx.projectSnapshot.create({
      data: {
        projectId: project.id,
        source,
        uploadKind: request.uploadKind,
        sourceName: request.sourceName,
        totalFiles: analysis.totalFiles,
        totalLines: analysis.totalLines,
        totalBytes: analysis.totalBytes,
        completionPct,
      },
      select: { id: true },
    });

    for (const batch of chunk(analysis.languages, INSERT_CHUNK)) {
      await tx.languageStat.createMany({
        data: batch.map((l) => ({ ...l, snapshotId: snapshot.id })),
      });
    }

    if (project.trackFiles) {
      for (const batch of chunk(analysis.files, INSERT_CHUNK)) {
        await tx.snapshotFile.createMany({
          data: batch.map((f) => ({
            snapshotId: snapshot.id,
            path: f.path,
            pathHash: f.pathHash,
            language: f.language,
            lines: f.lines,
            bytes: f.bytes,
          })),
        });
      }
    }

    if (isNewProject) {
      await tx.activityLogEntry.create({
        data: {
          projectId: project.id,
          actorId: request.user.id,
          type: "PROJECT_CREATED",
          summary: `Created ${project.name}`,
        },
      });
    }

    await tx.activityLogEntry.create({
      data: {
        projectId: project.id,
        actorId: request.user.id,
        snapshotId: snapshot.id,
        type: isNewProject ? "SNAPSHOT_UPLOADED" : "SNAPSHOT_RESCANNED",
        summary: `${isNewProject ? "Uploaded" : "Re-scanned"} ${request.sourceName} — ${analysis.totalFiles} files, ${analysis.totalLines.toLocaleString()} lines`,
        metadata: {
          uploadKind: request.uploadKind,
          totalFiles: analysis.totalFiles,
          totalLines: analysis.totalLines,
          totalBytes: analysis.totalBytes,
          skipped: analysis.skipped,
        },
      },
    });

    return snapshot.id;
  });

  return {
    projectId: project.id,
    projectName: project.name,
    snapshotId,
    isNewProject,
    totalFiles: analysis.totalFiles,
    totalLines: analysis.totalLines,
    totalBytes: analysis.totalBytes,
    languages: analysis.languages.map((l) => ({
      language: l.language,
      bytes: l.bytes,
      lines: l.lines,
    })),
    skipped: analysis.skipped,
  };
}
