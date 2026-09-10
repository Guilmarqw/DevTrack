import Link from "next/link";
import { requireUser, projectScope } from "@/lib/session";
import { db } from "@/lib/db";
import { DashboardHeader } from "@/components/DashboardHeader";
import { HealthBadge } from "@/components/HealthBadge";
import { projectHealth } from "@/lib/health";
import { UploadDropzone } from "./UploadDropzone";

export const metadata = { title: "Dashboard · DevTrack" };

// The session is read from a cookie on every request, so nothing here is
// safe to cache.
export const dynamic = "force-dynamic";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function DashboardPage({
  searchParams,
}: PageProps<"/dashboard">) {
  const user = await requireUser();
  // Next 16: searchParams is async and must be awaited.
  const params = await searchParams;
  // Set by the delete action's redirect. Rendered as text, which React escapes
  // — it is the owner's own project name, but it still arrives from the URL.
  const deletedRaw = params?.deleted;
  const deleted =
    typeof deletedRaw === "string" && deletedRaw.trim() ? deletedRaw : null;

  const projects = await db.project.findMany({
    where: { ...projectScope(user), archivedAt: null },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      owner: { select: { email: true } },
      _count: { select: { snapshots: true } },
      // Newest snapshot only; the full series is read on the detail page.
      snapshots: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          createdAt: true,
          totalFiles: true,
          totalLines: true,
          totalBytes: true,
          findingsScanned: true,
          findings: { select: { severity: true } },
          languageStats: {
            orderBy: { bytes: "desc" },
            take: 3,
            select: { language: true },
          },
        },
      },
    },
  });

  // A project with no snapshot at all has nothing to check yet, so it is not
  // "unchecked" — it is unmeasured, and the empty-state copy covers it.
  const unchecked = projects.filter(
    (project) =>
      project.snapshots[0] &&
      !project.snapshots[0].findingsScanned &&
      project.snapshots[0].findings.length === 0,
  );

  return (
    <>
      <DashboardHeader user={user} />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <div className="rise">
        <h1 className="text-xl font-medium tracking-tight">Projects</h1>
        <p className="mt-1 text-sm text-muted">
          {user.role === "ADMIN"
            ? "Every account's projects."
            : "Everything you are tracking."}
        </p>
      </div>

      {deleted && (
        <p
          role="status"
          className="fade mt-4 rounded-md border border-line bg-surface px-3 py-2 text-xs text-muted"
        >
          Deleted <span className="font-medium text-ink">{deleted}</span> and
          everything measured from it.
        </p>
      )}

      <section className="rise mt-8">
        <h2 className="text-xs font-medium uppercase tracking-wider text-faint">
          Add a project
        </h2>
        <div className="mt-3">
          <UploadDropzone />
        </div>
      </section>

      {/* Only rendered when there is something to act on. A permanent empty
          "all checked" panel would be clutter on a dashboard that is meant to
          be read at a glance. */}
      {unchecked.length > 0 && (
        <section className="rise mt-10">
          <h2 className="text-xs font-medium uppercase tracking-wider text-faint">
            Not health-checked
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">
            {unchecked.length}{" "}
            {unchecked.length === 1 ? "project was" : "projects were"} last
            scanned before DevTrack looked for problems, so{" "}
            {unchecked.length === 1 ? "its" : "their"} health is unknown rather
            than good. Checking one needs its folder again — the measurements
            are stored but your source never was, so a scan has to see the
            files.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {unchecked.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}#add-files`}
                  className="press inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs transition-colors hover:border-accent hover:text-accent"
                >
                  <span
                    aria-hidden
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: "var(--color-faint)" }}
                  />
                  {project.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rise mt-10">
        <h2 className="text-xs font-medium uppercase tracking-wider text-faint">
          Tracked projects
        </h2>

        {projects.length === 0 ? (
          <div className="mt-3 rounded-lg border border-line bg-surface px-4 py-10 text-center">
            <p className="text-sm font-medium">No projects yet</p>
            <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted">
              Drop a folder above and DevTrack will count its lines, work out
              the language mix, and start tracking it over time.
            </p>
          </div>
        ) : (
          <ul className="stagger mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {projects.map((project) => {
              const latest = project.snapshots[0];
              return (
                <li
                  key={project.id}
                  className="px-4 py-3 transition-colors hover:bg-accent-soft"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/projects/${project.id}`}
                        className="text-sm font-medium hover:text-accent"
                      >
                        {project.name}
                      </Link>
                      {latest && (
                        <HealthBadge
                          size="sm"
                          health={projectHealth({
                            scanned: latest.findingsScanned,
                            findings: latest.findings,
                          })}
                        />
                      )}
                    </span>
                    <p className="text-xs text-faint">
                      {project._count.snapshots}{" "}
                      {project._count.snapshots === 1
                        ? "snapshot"
                        : "snapshots"}
                    </p>
                  </div>
                  {latest ? (
                    <p className="mt-1 text-xs text-muted">
                      {latest.totalFiles.toLocaleString()} files ·{" "}
                      {latest.totalLines.toLocaleString()} lines ·{" "}
                      {/* BigInt in the database so projects have no size
                          ceiling; Number is exact to 9 PB. */}
                      {formatBytes(Number(latest.totalBytes))}
                      {latest.languageStats.length > 0 && (
                        <>
                          {" · "}
                          {latest.languageStats
                            .map((l) => l.language)
                            .join(", ")}
                        </>
                      )}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-faint">
                      No snapshots yet
                    </p>
                  )}
                  {user.role === "ADMIN" && (
                    <p className="mt-1 text-xs text-faint">
                      owner: {project.owner.email}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {projects.length > 0 && (
          <p className="mt-3 text-xs text-faint">
            Open a project for its language mix, history and tasks.
          </p>
        )}
      </section>
      </main>
    </>
  );
}
