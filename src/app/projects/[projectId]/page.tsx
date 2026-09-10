import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, getSessionUser, projectScope } from "@/lib/session";
import { db } from "@/lib/db";
import { getProjectDetail } from "@/lib/projects";
import {
  assignLanguageColors,
  foldToNamed,
  percentOf,
} from "@/lib/viz/palette";
import {
  CompletionTrend,
  LanguageMix,
  LanguageTable,
  LocTrend,
  type LanguageRow,
  type TrendPoint,
} from "./Charts";
import { TaskList } from "./TaskList";
import { CompletionControl } from "./CompletionControl";
import { TechTags } from "./TechTags";
import { Dependencies } from "./Dependencies";
import { UploadDropzone } from "@/app/dashboard/UploadDropzone";

export const dynamic = "force-dynamic";

/**
 * Cheap existence + visibility check, deduplicated with React's cache so
 * generateMetadata and the page below share one query per request.
 */
const getVisibleProjectName = cache(async (projectId: string) => {
  const user = await getSessionUser();
  if (!user) return null;

  const project = await db.project.findFirst({
    where: { id: projectId, ...projectScope(user) },
    select: { name: true },
  });
  return project?.name ?? null;
});

/**
 * Names the browser tab after the project, and raises the 404 early so a bad
 * id costs one small query instead of the whole detail load. The page body
 * keeps its own check as a backstop.
 *
 * This route deliberately has NO loading.tsx. A route-level loading file wraps
 * the page in a Suspense boundary, and Next then flushes the shell with a 200
 * before `notFound()` can run — the correct page renders under the wrong
 * status, from here or from the body. Correct status won over a skeleton;
 * the local queries are single-digit milliseconds anyway.
 */
export async function generateMetadata({
  params,
}: PageProps<"/projects/[projectId]">) {
  const { projectId } = await params;
  const name = await getVisibleProjectName(projectId);
  if (!name) notFound();

  return { title: `${name} · DevTrack` };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const dateTime = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});
const shortDate = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
});
const shortTime = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Axis labels for the snapshot series.
 *
 * Re-scans often land on the same day — several in one afternoon is normal —
 * and a date-only label then renders as four identical ticks. So the first
 * snapshot of each day carries the date and the rest carry the time. The
 * tooltip always shows the full date and time, so nothing is lost.
 */
function axisLabels(dates: Date[]): string[] {
  let previousDay = "";
  return dates.map((date) => {
    const day = shortDate.format(date);
    if (day === previousDay) return shortTime.format(date);
    previousDay = day;
    // With more than one snapshot in the series, a bare date is ambiguous the
    // moment a second one lands the same day, so lead with date + time.
    return day;
  });
}

/**
 * Stat tile. `delta` is plain muted text unless `upIsGood` is set — more lines
 * of code is not self-evidently better, so colouring that delta green would
 * assert something the data does not say.
 */
function StatTile({
  label,
  value,
  delta,
  upIsGood = false,
}: {
  label: string;
  value: string;
  delta?: number | null;
  upIsGood?: boolean;
}) {
  const showDelta = typeof delta === "number" && delta !== 0;
  const positive = (delta ?? 0) > 0;
  const deltaColor = upIsGood
    ? positive
      ? "var(--color-series-6)"
      : "var(--color-series-8)"
    : undefined;

  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {showDelta ? (
        <p className="mt-0.5 text-xs" style={deltaColor ? { color: deltaColor } : undefined}>
          {positive ? "+" : ""}
          {delta!.toLocaleString()} since previous
        </p>
      ) : (
        <p className="mt-0.5 text-xs text-faint">
          {typeof delta === "number" ? "no change" : " "}
        </p>
      )}
    </div>
  );
}

export default async function ProjectPage({
  params,
}: PageProps<"/projects/[projectId]">) {
  // Next 16: params is async and must be awaited.
  const { projectId } = await params;
  const user = await requireUser();

  const detail = await getProjectDetail(projectId, user);
  if (!detail) notFound();

  const {
    project,
    snapshots,
    latest,
    previous,
    activity,
    completionPct,
    dependencies,
  } = detail;

  const activeTags = project.techTags.filter((tag) => !tag.dismissedAt);
  const dismissedTags = project.techTags.filter((tag) => tag.dismissedAt);

  // One colour map for the whole page, built from every snapshot, so a
  // language keeps its colour across the bar, the table and the trend.
  const colors = assignLanguageColors(
    snapshots.flatMap((snapshot) => snapshot.languageStats),
  );

  const languageRows: LanguageRow[] = latest
    ? (() => {
        const folded = foldToNamed(latest.languageStats, colors);
        const total = folded.reduce((sum, row) => sum + row.bytes, 0);
        return folded.map((row) => ({
          ...row,
          percent: percentOf(row.bytes, total),
        }));
      })()
    : [];

  const labels = axisLabels(snapshots.map((snapshot) => snapshot.createdAt));
  const trend: TrendPoint[] = snapshots.map((snapshot, index) => ({
    label: labels[index],
    fullLabel: dateTime.format(snapshot.createdAt),
    lines: snapshot.totalLines,
    files: snapshot.totalFiles,
    completionPct: snapshot.completionPct,
  }));

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <nav className="text-xs">
        <Link href="/dashboard" className="text-muted hover:text-accent">
          ← Dashboard
        </Link>
      </nav>

      <header className="mt-4">
        <h1 className="text-xl font-medium tracking-tight">{project.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {snapshots.length} {snapshots.length === 1 ? "snapshot" : "snapshots"}
          {latest && (
            <>
              <span className="text-faint"> · </span>
              last scanned {dateTime.format(latest.createdAt)}
            </>
          )}
          {user.role === "ADMIN" && (
            <>
              <span className="text-faint"> · </span>
              owner: {project.owner.email}
            </>
          )}
        </p>
      </header>

      {/* KPI row — headline numbers as tiles rather than a one-bar chart. */}
      <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Lines of code"
          value={latest ? latest.totalLines.toLocaleString() : "—"}
          delta={
            latest && previous ? latest.totalLines - previous.totalLines : null
          }
        />
        <StatTile
          label="Files"
          value={latest ? latest.totalFiles.toLocaleString() : "—"}
          delta={
            latest && previous ? latest.totalFiles - previous.totalFiles : null
          }
        />
        <StatTile
          label="Size"
          value={latest ? formatBytes(latest.totalBytes) : "—"}
        />
        <StatTile
          label="Complete"
          value={`${completionPct.toFixed(0)}%`}
          upIsGood
        />
      </section>

      <section className="mt-10">
        <h2 className="text-xs font-medium uppercase tracking-wider text-faint">
          Language mix
        </h2>
        <p className="mt-1 text-xs text-muted">
          Share of counted bytes in the latest snapshot.
        </p>
        <div className="mt-3 rounded-lg border border-line bg-surface px-4 py-4">
          <LanguageMix rows={languageRows} />
          <LanguageTable rows={languageRows} />
        </div>
      </section>

      {/* Two charts, never one with two y-axes: lines and a percentage have no
          shared scale, and aligning two would invent a correlation. */}
      <section className="mt-10 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-line bg-surface px-4 py-4">
          <h2 className="text-xs font-medium uppercase tracking-wider text-faint">
            Lines of code over time
          </h2>
          <div className="mt-3">
            <LocTrend data={trend} />
          </div>
        </div>
        <div className="rounded-lg border border-line bg-surface px-4 py-4">
          <h2 className="text-xs font-medium uppercase tracking-wider text-faint">
            Completion over time
          </h2>
          <div className="mt-3">
            <CompletionTrend data={trend} />
          </div>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xs font-medium uppercase tracking-wider text-faint">
          Tech stack
        </h2>
        <p className="mt-1 text-xs text-muted">
          Inferred from manifests and config files. Keep a guess to make it
          permanent, or dismiss it so re-scans stop suggesting it.
        </p>
        <div className="mt-3 rounded-lg border border-line bg-surface px-4 py-4">
          <TechTags
            projectId={project.id}
            tags={activeTags}
            dismissed={dismissedTags}
          />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xs font-medium uppercase tracking-wider text-faint">
          Dependencies
        </h2>
        <p className="mt-1 text-xs text-muted">
          {dependencies.length > 0
            ? `${dependencies.length} declared in the latest snapshot, with the ranges as written.`
            : "Read from the latest snapshot."}
        </p>
        <div className="mt-3 rounded-lg border border-line bg-surface px-4 py-4">
          <Dependencies rows={dependencies} />
        </div>
      </section>

      <section className="mt-10 grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="text-xs font-medium uppercase tracking-wider text-faint">
            Tasks
          </h2>
          <div className="mt-3">
            <TaskList projectId={project.id} tasks={project.tasks} />
          </div>
          <div className="mt-4 rounded-lg border border-line bg-surface px-4 py-3">
            <CompletionControl
              projectId={project.id}
              mode={project.completionMode}
              manualPct={project.manualCompletionPct}
            />
          </div>
        </div>

        <div>
          <h2 className="text-xs font-medium uppercase tracking-wider text-faint">
            Activity
          </h2>
          {activity.length === 0 ? (
            <p className="mt-3 text-xs text-muted">Nothing recorded yet.</p>
          ) : (
            <ol className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
              {activity.map((entry) => (
                <li key={entry.id} className="px-4 py-2.5">
                  <p className="text-sm">{entry.summary}</p>
                  <p className="mt-0.5 text-xs text-faint">
                    {dateTime.format(entry.createdAt)}
                    {entry.actor && ` · ${entry.actor.email}`}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xs font-medium uppercase tracking-wider text-faint">
          Add a snapshot
        </h2>
        <p className="mt-1 text-xs text-muted">
          Re-upload this project to record how it has changed.
        </p>
        <div className="mt-3">
          <UploadDropzone projectId={project.id} />
        </div>
      </section>
    </main>
  );
}
