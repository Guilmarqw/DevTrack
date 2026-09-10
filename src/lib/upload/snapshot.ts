import { db } from "@/lib/db";
import { analyze, type RawEntry } from "@/lib/analyzer/analyze";
import { scanDependencies } from "@/lib/analyzer/dependencies";
import { detectTech, type DetectedTech } from "@/lib/analyzer/tech";
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
  dependencyCount: number;
  manifests: string[];
  /** Manifests that could not be parsed, so a typo is visible not silent. */
  manifestProblems: Array<{ path: string; reason: string }>;
  detectedTech: string[];
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

  // Dependencies are snapshot-scoped, so they get versioned like the metrics.
  // Tech tags are project-scoped because a person edits them, so they are
  // reconciled against what the owner has already decided.
  const depScan = scanDependencies(request.entries);
  const detected = detectTech(request.entries, depScan.dependencies);

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

    for (const batch of chunk(depScan.dependencies, INSERT_CHUNK)) {
      await tx.dependency.createMany({
        data: batch.map((dep) => ({
          snapshotId: snapshot.id,
          name: dep.name,
          version: dep.version,
          manager: dep.manager,
          scope: dep.scope,
          sourceFile: dep.sourceFile,
        })),
      });
    }

    await reconcileTechTags(tx, project.id, detected);

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
    dependencyCount: depScan.dependencies.length,
    manifests: depScan.manifests,
    manifestProblems: depScan.problems,
    detectedTech: detected.map((t) => t.name),
  };
}

/**
 * Folds a fresh detection into the tags the owner already has, without ever
 * overruling them:
 *
 *   - a dismissed tag stays dismissed — re-scans must not resurrect a
 *     detection the owner has already rejected;
 *   - a MANUAL tag is never touched, whether or not it was detected this time.
 *     Confirming a suggestion promotes it to MANUAL, which is what makes it
 *     survive from then on;
 *   - a DETECTED tag that is no longer detected is deleted, because it is
 *     derived data and keeping it would show a stack the code no longer has.
 */
async function reconcileTechTags(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  projectId: string,
  detected: DetectedTech[],
) {
  const existing = await tx.techTag.findMany({
    where: { projectId },
    select: {
      id: true,
      name: true,
      category: true,
      origin: true,
      dismissedAt: true,
    },
  });

  const keyOf = (t: { category: string; name: string }) =>
    `${t.category}:${t.name}`;
  const existingByKey = new Map(existing.map((tag) => [keyOf(tag), tag]));
  const detectedKeys = new Set(detected.map(keyOf));

  for (const tech of detected) {
    const current = existingByKey.get(keyOf(tech));

    if (!current) {
      await tx.techTag.create({
        data: {
          projectId,
          name: tech.name,
          category: tech.category,
          origin: "DETECTED",
          evidence: tech.evidence,
        },
      });
      continue;
    }

    if (current.dismissedAt || current.origin === "MANUAL") continue;

    await tx.techTag.update({
      where: { id: current.id },
      data: { evidence: tech.evidence },
    });
  }

  const stale = existing.filter(
    (tag) =>
      tag.origin === "DETECTED" &&
      !tag.dismissedAt &&
      !detectedKeys.has(keyOf(tag)),
  );

  if (stale.length > 0) {
    await tx.techTag.deleteMany({
      where: { id: { in: stale.map((tag) => tag.id) } },
    });
  }
}
