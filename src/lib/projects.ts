import { db } from "@/lib/db";
import { projectScope, type SessionUser } from "@/lib/session";
import { computeCompletion } from "@/lib/completion";

/**
 * Loads everything the detail page draws. Returns null when the project does
 * not exist OR the viewer may not see it — the caller renders a 404 either
 * way, so a standard user cannot probe for other people's project ids.
 */
export async function getProjectDetail(projectId: string, user: SessionUser) {
  const project = await db.project.findFirst({
    where: { id: projectId, ...projectScope(user) },
    select: {
      id: true,
      name: true,
      description: true,
      completionMode: true,
      manualCompletionPct: true,
      trackFiles: true,
      createdAt: true,
      owner: { select: { email: true, name: true } },
      tasks: {
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        select: {
          id: true,
          title: true,
          status: true,
          weight: true,
          completedAt: true,
          createdAt: true,
        },
      },
      // Dismissed tags come back too: the UI shows them behind a disclosure
      // so a rejected guess can be restored without a database trip.
      techTags: {
        orderBy: [{ category: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          category: true,
          origin: true,
          evidence: true,
          dismissedAt: true,
        },
      },
    },
  });

  if (!project) return null;

  // Oldest first: the charts read left-to-right in time order.
  const snapshotRows = await db.projectSnapshot.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      createdAt: true,
      source: true,
      uploadKind: true,
      sourceName: true,
      totalFiles: true,
      totalLines: true,
      totalBytes: true,
      completionPct: true,
      languageStats: {
        orderBy: { bytes: "desc" },
        select: { language: true, bytes: true, lines: true, fileCount: true },
      },
    },
  });

  // Byte counts are BigInt in the database so a project has no size ceiling,
  // but a bigint cannot be serialised into a client component. Number is exact
  // to 9 petabytes, so converting here is lossless and keeps every consumer
  // working in plain numbers.
  const snapshots = snapshotRows.map((snapshot) => ({
    ...snapshot,
    totalBytes: Number(snapshot.totalBytes),
    languageStats: snapshot.languageStats.map((stat) => ({
      ...stat,
      bytes: Number(stat.bytes),
    })),
  }));

  const activity = await db.activityLogEntry.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      type: true,
      summary: true,
      createdAt: true,
      actor: { select: { email: true, name: true } },
    },
  });

  const latest = snapshots.at(-1) ?? null;
  const previous = snapshots.length > 1 ? snapshots.at(-2)! : null;

  // Dependencies are snapshot-scoped, and only the newest set is worth
  // listing — older ones exist so history is not lost, not to be read.
  const dependencies = latest
    ? await db.dependency.findMany({
        where: { snapshotId: latest.id },
        orderBy: [{ manager: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          version: true,
          manager: true,
          scope: true,
          sourceFile: true,
        },
      })
    : [];

  return {
    project,
    snapshots,
    latest,
    previous,
    activity,
    dependencies,
    // Live figure from current task state, which is not the same as the value
    // frozen into the latest snapshot.
    completionPct: computeCompletion(project, project.tasks),
  };
}

export type ProjectDetail = NonNullable<
  Awaited<ReturnType<typeof getProjectDetail>>
>;
