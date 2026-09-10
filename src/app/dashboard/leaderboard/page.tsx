import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getLeaderboard } from "@/lib/analytics";
import { DashboardHeader } from "@/components/DashboardHeader";

export const metadata = { title: "Leaderboard · DevTrack" };
export const dynamic = "force-dynamic";

/** Medal-free ranking: a number reads faster and does not imply a prize. */
function Rank({ index }: { index: number }) {
  return (
    <span className="tabular w-5 shrink-0 text-xs text-faint">
      {index + 1}
    </span>
  );
}

function You() {
  return (
    <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
      you
    </span>
  );
}

export default async function LeaderboardPage() {
  const user = await requireUser();
  const board = await getLeaderboard(user);

  // Deliberately no colour swatches on the language rows. A colour map built
  // from these totals would rank languages differently from the analytics
  // page, so the same language could be blue here and orange there — and
  // "colour follows the entity" is the one rule the chart palette must keep.
  // The language name is its own label; a dot would add nothing but a lie.

  const maxLines = Math.max(1, ...board.byLines.map((e) => e.lines));
  const hasData = board.byLines.some((entry) => entry.lines > 0);

  return (
    <>
      <DashboardHeader user={user} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <div className="rise">
          <h1 className="text-xl font-medium tracking-tight">Leaderboard</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
            Standings across accounts on this instance, counted from the latest
            snapshot of each project. Only display names and totals appear here
            — never project names or paths.
          </p>
        </div>

        {!hasData ? (
          <section className="rise mt-8 rounded-lg border border-line bg-surface px-4 py-12 text-center">
            <p className="text-sm font-medium">No standings yet</p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted">
              Once an account has scanned a project there is something to rank.
              Upload one and you will be on the board.
            </p>
            <Link
              href="/dashboard"
              className="press mt-4 inline-block rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink transition-opacity hover:opacity-90"
            >
              Add a project
            </Link>
          </section>
        ) : (
          <div className="mt-8 grid gap-8 lg:grid-cols-2">
            <section className="rise">
              <h2 className="text-xs font-medium uppercase tracking-wider text-faint">
                Most lines written
              </h2>
              <ol className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
                {board.byLines.map((entry, index) => (
                  <li key={entry.userId} className="px-4 py-3">
                    <div className="flex items-baseline gap-2">
                      <Rank index={index} />
                      <span className="text-sm font-medium">
                        {entry.displayName}
                      </span>
                      {entry.isViewer && <You />}
                      <span className="tabular ml-auto text-xs text-muted">
                        {entry.lines.toLocaleString()}
                      </span>
                    </div>

                    <div className="mt-2 ml-7 h-1.5 overflow-hidden rounded-full bg-line">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(entry.lines / maxLines) * 100}%`,
                          backgroundColor: entry.isViewer
                            ? "var(--color-accent)"
                            : "var(--color-series-1)",
                        }}
                      />
                    </div>

                    <p className="ml-7 mt-1.5 text-xs text-faint">
                      {entry.projects}{" "}
                      {entry.projects === 1 ? "project" : "projects"}
                      <span className="text-faint"> · </span>
                      {entry.snapshots}{" "}
                      {entry.snapshots === 1 ? "snapshot" : "snapshots"}
                      {entry.topLanguage && (
                        <>
                          <span className="text-faint"> · </span>
                          mostly {entry.topLanguage}
                        </>
                      )}
                    </p>
                  </li>
                ))}
              </ol>
            </section>

            <section className="rise">
              <h2 className="text-xs font-medium uppercase tracking-wider text-faint">
                Best at each language
              </h2>
              <p className="mt-1 text-xs text-muted">
                Most lines in that language. Languages more than one account
                writes in come first.
              </p>

              {board.languageLeaders.length === 0 ? (
                <p className="mt-3 text-xs text-muted">
                  No languages detected yet.
                </p>
              ) : (
                <ol className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
                  {board.languageLeaders.slice(0, 12).map((leader) => (
                    <li
                      key={leader.language}
                      className="flex items-center gap-2 px-4 py-2.5"
                    >
                      <span className="text-sm">{leader.language}</span>
                      <span className="ml-auto flex items-center gap-2 text-xs">
                        {leader.isViewer && <You />}
                        <span className="text-muted">{leader.displayName}</span>
                        <span className="tabular text-faint">
                          {leader.lines.toLocaleString()}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="rise lg:col-span-2">
              <h2 className="text-xs font-medium uppercase tracking-wider text-faint">
                Most projects tracked
              </h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {board.byProjects.map((entry, index) => (
                  <li
                    key={entry.userId}
                    className="lift flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs"
                  >
                    <Rank index={index} />
                    <span className="font-medium">{entry.displayName}</span>
                    {entry.isViewer && <You />}
                    <span className="tabular text-muted">
                      {entry.projects}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}

        {board.hiddenCount > 0 && (
          <p className="mt-8 text-xs text-faint">
            {board.hiddenCount}{" "}
            {board.hiddenCount === 1 ? "account has" : "accounts have"} opted
            out of the leaderboard. You can too, in{" "}
            <Link
              href="/dashboard/settings"
              className="text-muted hover:text-accent"
            >
              settings
            </Link>
            .
          </p>
        )}
      </main>
    </>
  );
}
