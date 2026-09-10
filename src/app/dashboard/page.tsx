import Link from "next/link";
import { requireUser, projectScope } from "@/lib/session";
import { db } from "@/lib/db";
import { DashboardHeader } from "@/components/DashboardHeader";
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

export default async function DashboardPage() {
  const user = await requireUser();

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
          languageStats: {
            orderBy: { bytes: "desc" },
            take: 3,
            select: { language: true },
          },
        },
      },
    },
  });

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

      <section className="rise mt-8">
        <h2 className="text-xs font-medium uppercase tracking-wider text-faint">
          Add a project
        </h2>
        <div className="mt-3">
          <UploadDropzone />
        </div>
      </section>

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
                    <Link
                      href={`/projects/${project.id}`}
                      className="text-sm font-medium hover:text-accent"
                    >
                      {project.name}
                    </Link>
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
                      {formatBytes(latest.totalBytes)}
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
