import { languageFacts, type LanguageRole } from "@/lib/languageInfo";

/**
 * Per-project analysis — the questions that only make sense about one
 * codebase, as opposed to the account-wide figures on /dashboard/analytics.
 *
 * That page answers "how much am I building, and where"; this answers "what
 * is *this* project made of, and which way is it moving". Keeping them apart
 * is the point: a language mix across every project you own tells you about
 * your habits, and a language mix inside one project tells you about its
 * architecture. Mixing them produces a chart that answers neither.
 *
 * Every figure here is derived arithmetic over stored snapshots. Where the
 * data cannot support a figure — a rate over less than a day, a concentration
 * with no languages — the field is null and the UI says why, rather than
 * printing a number that would be extrapolation.
 */

export type RoleShare = {
  role: LanguageRole | "Unclassified";
  lines: number;
  share: number;
};

export type ProjectAnalysisResult = {
  /** Composition by what each language is *for*. */
  roles: RoleShare[];
  growth: {
    trackedDays: number;
    firstLines: number;
    latestLines: number;
    delta: number;
    /** Null until there is more than a day between first and last snapshot. */
    perDay: number | null;
  } | null;
  concentration: {
    topLanguage: string;
    topShare: number;
    /** How few languages account for 90% of the lines. */
    languagesFor90: number;
    totalLanguages: number;
  } | null;
  size: {
    linesPerFile: number;
    bytesPerLine: number;
  } | null;
  dependencies: {
    total: number;
    byScope: Array<{ scope: string; count: number }>;
    managers: string[];
  };
};

type SnapshotLike = {
  createdAt: Date;
  totalLines: number;
  totalFiles: number;
  totalBytes: number;
  languageStats: Array<{ language: string; lines: number }>;
};

type DependencyLike = { scope: string; manager: string };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Fixed role order, so the composition bar reads the same on every project and
 * a role keeps its colour slot from one project to the next.
 */
const ROLE_ORDER: Array<RoleShare["role"]> = [
  "Front end",
  "Back end",
  "Systems",
  "Data",
  "Config",
  "Tooling",
  "Docs",
  "Unclassified",
];

export function analyseProject(input: {
  snapshots: SnapshotLike[];
  dependencies: DependencyLike[];
}): ProjectAnalysisResult {
  const { snapshots, dependencies } = input;
  const latest = snapshots.at(-1) ?? null;
  const first = snapshots[0] ?? null;

  // --- composition by role ---
  const roleLines = new Map<RoleShare["role"], number>();
  let classifiedTotal = 0;

  for (const stat of latest?.languageStats ?? []) {
    const facts = languageFacts(stat.language);
    // "Other" is the analyzer's own catch-all and has no role by design, so it
    // lands in Unclassified rather than being dropped — a project that is 40%
    // unrecognised should say so.
    const role: RoleShare["role"] = facts ? facts.role : "Unclassified";
    roleLines.set(role, (roleLines.get(role) ?? 0) + stat.lines);
    classifiedTotal += stat.lines;
  }

  const roles: RoleShare[] = ROLE_ORDER.filter((role) => roleLines.has(role))
    .map((role) => {
      const lines = roleLines.get(role) ?? 0;
      return {
        role,
        lines,
        share: classifiedTotal > 0 ? (lines / classifiedTotal) * 100 : 0,
      };
    })
    .filter((entry) => entry.lines > 0);

  // --- growth ---
  let growth: ProjectAnalysisResult["growth"] = null;
  if (first && latest && snapshots.length > 1) {
    const spanMs = latest.createdAt.getTime() - first.createdAt.getTime();
    const trackedDays = spanMs / DAY_MS;
    const delta = latest.totalLines - first.totalLines;

    growth = {
      trackedDays,
      firstLines: first.totalLines,
      latestLines: latest.totalLines,
      delta,
      // Under a day, a per-day figure is multiplication rather than
      // measurement: three re-scans in one afternoon would read as thousands
      // of lines a day.
      perDay: trackedDays >= 1 ? delta / trackedDays : null,
    };
  }

  // --- concentration ---
  let concentration: ProjectAnalysisResult["concentration"] = null;
  const stats = [...(latest?.languageStats ?? [])]
    .filter((stat) => stat.lines > 0)
    .sort((a, b) => b.lines - a.lines);
  const totalLines = stats.reduce((sum, stat) => sum + stat.lines, 0);

  if (stats.length > 0 && totalLines > 0) {
    let running = 0;
    let languagesFor90 = 0;
    for (const stat of stats) {
      running += stat.lines;
      languagesFor90 += 1;
      if (running / totalLines >= 0.9) break;
    }

    concentration = {
      topLanguage: stats[0].language,
      topShare: (stats[0].lines / totalLines) * 100,
      languagesFor90,
      totalLanguages: stats.length,
    };
  }

  // --- size ---
  const size =
    latest && latest.totalFiles > 0 && latest.totalLines > 0
      ? {
          linesPerFile: latest.totalLines / latest.totalFiles,
          bytesPerLine: latest.totalBytes / latest.totalLines,
        }
      : null;

  // --- dependencies ---
  const scopeCounts = new Map<string, number>();
  const managers = new Set<string>();
  for (const dep of dependencies) {
    scopeCounts.set(dep.scope, (scopeCounts.get(dep.scope) ?? 0) + 1);
    managers.add(dep.manager);
  }

  const SCOPE_ORDER = ["RUNTIME", "DEV", "PEER", "OPTIONAL"];
  return {
    roles,
    growth,
    concentration,
    size,
    dependencies: {
      total: dependencies.length,
      byScope: SCOPE_ORDER.filter((scope) => scopeCounts.has(scope)).map(
        (scope) => ({ scope, count: scopeCounts.get(scope) ?? 0 }),
      ),
      managers: [...managers].sort(),
    },
  };
}
