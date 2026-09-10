import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getAccountAnalytics } from "@/lib/analytics";
import { assignLanguageColors, foldToNamed, percentOf } from "@/lib/viz/palette";
import { DashboardHeader } from "@/components/DashboardHeader";
import { LanguageMix, LanguageTable, type LanguageRow } from "@/app/projects/[projectId]/Charts";
import { UploadActivity } from "./AnalyticsCharts";

export const metadata = { title: "Analytics · DevTrack" };
export const dynamic = "force-dynamic";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const dateTime = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="lift rounded-lg border border-line bg-surface px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-0.5 text-xs text-faint">{note ?? " "}</p>
    </div>
  );
}

export default async function AnalyticsPage() {
  const user = await requireUser();
  const data = await getAccountAnalytics(user);

  // One colour map across the whole account, so a language keeps its colour
  // between this page and each project page.
  const colors = assignLanguageColors(data.languages);
  const folded = foldToNamed(
    data.languages.map((l) => ({
      language: l.language,
      bytes: l.bytes,
      lines: l.lines,
    })),
    colors,
  );
  const totalBytes = folded.reduce((sum, row) => sum + row.bytes, 0);
  const languageRows: LanguageRow[] = folded.map((row) => ({
    ...row,
    percent: percentOf(row.bytes, totalBytes),
  }));

  const maxProjectLines = Math.max(1, ...data.projects.map((p) => p.lines));

  return (
    <>
      <DashboardHeader user={user} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <div className="rise">
          <h1 className="text-xl font-medium tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-muted">
            {user.role === "ADMIN"
              ? "Across every account's projects, from the latest snapshot of each."
              : "Across your projects, from the latest snapshot of each."}
          </p>
        </div>

        <section className="stagger mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            label="Projects"
            value={data.totals.projects.toLocaleString()}
            note={
              data.totals.projects === data.totals.measuredProjects
                ? undefined
                : `${data.totals.measuredProjects} scanned`
            }
          />
          <StatTile
            label="Lines of code"
            value={data.totals.lines.toLocaleString()}
            note={`${data.totals.files.toLocaleString()} files`}
          />
          <StatTile
            label="Languages"
            value={data.totals.languages.toLocaleString()}
            note={formatBytes(data.totals.bytes)}
          />
          <StatTile
            label="Avg. completion"
            value={`${data.totals.averageCompletion.toFixed(0)}%`}
            note={`${data.totals.snapshots.toLocaleString()} snapshots`}
          />
        </section>

        {data.totals.projects === 0 ? (
          <section className="rise mt-8 rounded-lg border border-line bg-surface px-4 py-12 text-center">
            <p className="text-sm font-medium">Nothing to analyse yet</p>
            <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted">
              Upload a project and this page fills in with its languages, size
              and scan history.
            </p>
            <Link
              href="/dashboard"
              className="press mt-4 inline-block rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink transition-opacity hover:opacity-90"
            >
              Add a project
            </Link>
          </section>
        ) : (
          <>
            <section className="rise mt-10">
              <h2 className="text-xs font-medium uppercase tracking-wider text-faint">
                Language mix, all projects
              </h2>
              <div className="mt-3 rounded-lg border border-line bg-surface px-4 py-4">
                <LanguageMix rows={languageRows} />
                <LanguageTable rows={languageRows} />
              </div>
            </section>

            <section className="rise mt-10">
              <h2 className="text-xs font-medium uppercase tracking-wider text-faint">
                Scans per day, last 30 days
              </h2>
              <div className="mt-3 rounded-lg border border-line bg-surface px-4 py-4">
                <UploadActivity data={data.uploadDays} />
              </div>
            </section>

            <section className="rise mt-10">
              <h2 className="text-xs font-medium uppercase tracking-wider text-faint">
                Projects by size
              </h2>
              <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
                {data.projects.map((project) => (
                  <li key={project.id} className="px-4 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <Link
                        href={`/projects/${project.id}`}
                        className="text-sm font-medium hover:text-accent"
                      >
                        {project.name}
                      </Link>
                      <span className="tabular text-xs text-muted">
                        {project.lines.toLocaleString()} lines
                      </span>
                    </div>

                    {/* A plain proportional bar: one measure, one colour, and
                        the value is already written beside it. */}
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${percentOf(project.lines, maxProjectLines)}%`,
                          backgroundColor: "var(--color-series-1)",
                        }}
                      />
                    </div>

                    <p className="mt-1.5 text-xs text-faint">
                      {project.snapshots}{" "}
                      {project.snapshots === 1 ? "snapshot" : "snapshots"}
                      <span className="text-faint"> · </span>
                      {project.completionPct.toFixed(0)}% complete
                      {project.lastScanned && (
                        <>
                          <span className="text-faint"> · </span>
                          {dateTime.format(project.lastScanned)}
                        </>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rise mt-10">
              <h2 className="text-xs font-medium uppercase tracking-wider text-faint">
                Recent activity
              </h2>
              {data.activity.length === 0 ? (
                <p className="mt-3 text-xs text-muted">Nothing recorded yet.</p>
              ) : (
                <ol className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
                  {data.activity.map((entry) => (
                    <li key={entry.id} className="px-4 py-2.5">
                      <p className="text-sm">{entry.summary}</p>
                      <p className="mt-0.5 text-xs text-faint">
                        <Link
                          href={`/projects/${entry.project.id}`}
                          className="hover:text-accent"
                        >
                          {entry.project.name}
                        </Link>
                        <span className="text-faint"> · </span>
                        {dateTime.format(entry.createdAt)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}
