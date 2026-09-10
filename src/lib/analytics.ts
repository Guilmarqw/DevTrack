import { db } from "@/lib/db";
import { projectScope, type SessionUser } from "@/lib/session";
import { computeCompletion } from "@/lib/completion";

/**
 * Aggregation happens in JavaScript rather than SQL.
 *
 * Every figure here is "the latest snapshot of each project, summed", which in
 * SQL is a group-wise maximum — a correlated subquery or a window function,
 * neither of which reads well through Prisma. On a local database with tens of
 * projects, fetching the newest snapshot per project and folding it in memory
 * is both clearer and fast enough.
 */

type LatestSnapshotSelect = {
  id: true;
  createdAt: true;
  totalFiles: true;
  totalLines: true;
  totalBytes: true;
  languageStats: { select: { language: true; lines: true; bytes: true } };
};

const latestSnapshot = {
  orderBy: { createdAt: "desc" },
  take: 1,
  select: {
    id: true,
    createdAt: true,
    totalFiles: true,
    totalLines: true,
    totalBytes: true,
    languageStats: { select: { language: true, lines: true, bytes: true } },
  },
} as const;

void (null as unknown as LatestSnapshotSelect);

export type LanguageTotal = {
  language: string;
  lines: number;
  bytes: number;
  projects: number;
};

export type UploadDay = { day: string; label: string; uploads: number };

/** Everything the analytics page draws, scoped to what the viewer may see. */
export async function getAccountAnalytics(user: SessionUser) {
  const projects = await db.project.findMany({
    where: { ...projectScope(user), archivedAt: null },
    select: {
      id: true,
      name: true,
      completionMode: true,
      manualCompletionPct: true,
      tasks: { select: { status: true, weight: true } },
      _count: { select: { snapshots: true } },
      snapshots: latestSnapshot,
    },
  });

  const languages = new Map<string, LanguageTotal>();
  let totalLines = 0;
  let totalFiles = 0;
  let totalBytes = 0;
  let measuredProjects = 0;

  const perProject = projects.map((project) => {
    const latest = project.snapshots[0] ?? null;
    if (latest) {
      measuredProjects += 1;
      totalLines += latest.totalLines;
      totalFiles += latest.totalFiles;
      // BigInt in the database so projects have no size ceiling; Number is
      // exact to 9 PB and is what every consumer expects.
      totalBytes += Number(latest.totalBytes);

      for (const stat of latest.languageStats) {
        const running = languages.get(stat.language) ?? {
          language: stat.language,
          lines: 0,
          bytes: 0,
          projects: 0,
        };
        running.lines += stat.lines;
        running.bytes += Number(stat.bytes);
        running.projects += 1;
        languages.set(stat.language, running);
      }
    }

    return {
      id: project.id,
      name: project.name,
      snapshots: project._count.snapshots,
      lines: latest?.totalLines ?? 0,
      files: latest?.totalFiles ?? 0,
      bytes: Number(latest?.totalBytes ?? 0),
      completionPct: computeCompletion(project, project.tasks),
      lastScanned: latest?.createdAt ?? null,
    };
  });

  // Uploads per day over the last 30 days, from the activity log rather than
  // the snapshots, so re-scans and first uploads both count.
  const since = new Date();
  since.setDate(since.getDate() - 29);
  since.setHours(0, 0, 0, 0);

  const uploadEvents = await db.activityLogEntry.findMany({
    where: {
      createdAt: { gte: since },
      type: { in: ["SNAPSHOT_UPLOADED", "SNAPSHOT_RESCANNED"] },
      project: { ...projectScope(user), archivedAt: null },
    },
    select: { createdAt: true },
  });

  const dayFormat = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  });
  const byDay = new Map<string, number>();
  for (const event of uploadEvents) {
    const key = event.createdAt.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }

  const uploadDays: UploadDay[] = [];
  for (let i = 0; i < 30; i += 1) {
    const date = new Date(since);
    date.setDate(since.getDate() + i);
    const key = date.toISOString().slice(0, 10);
    uploadDays.push({
      day: key,
      label: dayFormat.format(date),
      uploads: byDay.get(key) ?? 0,
    });
  }

  const activity = await db.activityLogEntry.findMany({
    where: { project: { ...projectScope(user), archivedAt: null } },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: {
      id: true,
      summary: true,
      createdAt: true,
      project: { select: { id: true, name: true } },
    },
  });

  const averageCompletion =
    perProject.length === 0
      ? 0
      : perProject.reduce((sum, p) => sum + p.completionPct, 0) /
        perProject.length;

  return {
    totals: {
      projects: projects.length,
      measuredProjects,
      snapshots: perProject.reduce((sum, p) => sum + p.snapshots, 0),
      lines: totalLines,
      files: totalFiles,
      bytes: totalBytes,
      languages: languages.size,
      averageCompletion,
    },
    languages: [...languages.values()].sort((a, b) => b.bytes - a.bytes),
    projects: perProject.sort((a, b) => b.lines - a.lines),
    uploadDays,
    activity,
  };
}

export type LeaderboardEntry = {
  userId: string;
  displayName: string;
  isViewer: boolean;
  projects: number;
  snapshots: number;
  lines: number;
  topLanguage: string | null;
};

export type LanguageLeader = {
  language: string;
  displayName: string;
  isViewer: boolean;
  lines: number;
  contenders: number;
};

/**
 * Cross-account standings.
 *
 * This is the one place a standard user sees anything about another account,
 * so the shape of what leaves this function matters: a display name and
 * aggregate totals, never a project name, a path, or an email. Users who have
 * opted out are excluded entirely rather than shown anonymised, because an
 * anonymous row in a two-person instance is not anonymous.
 */
export async function getLeaderboard(viewer: SessionUser) {
  const users = await db.user.findMany({
    where: { showOnLeaderboard: true },
    select: {
      id: true,
      name: true,
      email: true,
      projects: {
        where: { archivedAt: null },
        select: {
          _count: { select: { snapshots: true } },
          snapshots: latestSnapshot,
        },
      },
    },
  });

  const entries: LeaderboardEntry[] = [];
  const perLanguage = new Map<
    string,
    Array<{ userId: string; displayName: string; lines: number }>
  >();

  for (const user of users) {
    // Fall back to the local part of the address rather than the address
    // itself — an email is more than other accounts need to know.
    const displayName = user.name?.trim() || user.email.split("@")[0];

    let lines = 0;
    let snapshots = 0;
    const languageLines = new Map<string, number>();

    for (const project of user.projects) {
      snapshots += project._count.snapshots;
      const latest = project.snapshots[0];
      if (!latest) continue;
      lines += latest.totalLines;
      for (const stat of latest.languageStats) {
        languageLines.set(
          stat.language,
          (languageLines.get(stat.language) ?? 0) + stat.lines,
        );
      }
    }

    const ranked = [...languageLines.entries()].sort((a, b) => b[1] - a[1]);

    entries.push({
      userId: user.id,
      displayName,
      isViewer: user.id === viewer.id,
      projects: user.projects.length,
      snapshots,
      lines,
      topLanguage: ranked[0]?.[0] ?? null,
    });

    for (const [language, languageTotal] of ranked) {
      const list = perLanguage.get(language) ?? [];
      list.push({ userId: user.id, displayName, lines: languageTotal });
      perLanguage.set(language, list);
    }
  }

  const languageLeaders: LanguageLeader[] = [...perLanguage.entries()]
    .map(([language, contenders]) => {
      const sorted = [...contenders].sort((a, b) => b.lines - a.lines);
      const winner = sorted[0];
      return {
        language,
        displayName: winner.displayName,
        isViewer: winner.userId === viewer.id,
        lines: winner.lines,
        contenders: sorted.length,
      };
    })
    // Most-contested languages first: a language two people write in is a more
    // interesting standing than one only a single account has touched.
    .sort(
      (a, b) => b.contenders - a.contenders || b.lines - a.lines,
    );

  return {
    byLines: [...entries].sort((a, b) => b.lines - a.lines),
    byProjects: [...entries].sort(
      (a, b) => b.projects - a.projects || b.lines - a.lines,
    ),
    languageLeaders,
    /** Accounts excluded by their own choice, so the page can say so. */
    hiddenCount: await db.user.count({ where: { showOnLeaderboard: false } }),
  };
}
