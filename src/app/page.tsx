import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { ThemeToggle } from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: "DevTrack — personal developer analytics",
  description:
    "Drop in a project folder and DevTrack measures its languages, lines, dependencies and stack, then tracks how they move over time. Runs entirely on your own machine.",
};

// The footer reports live database state, so this can never be cached.
export const dynamic = "force-dynamic";

async function databaseStatus() {
  try {
    const [rows, accounts] = await Promise.all([
      db.$queryRaw<{ version: string }[]>`SELECT VERSION() AS version`,
      db.user.count(),
    ]);
    return {
      ok: true as const,
      version: rows[0]?.version ?? "unknown",
      accounts,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Distinguish "the server is down" from "the client is out of date" — the
    // second looks nothing like a connection failure, and blaming XAMPP for it
    // sends you looking in the wrong place.
    const looksLikeStaleClient = /reading '(\w+)'|is not a function/.test(
      message,
    );
    return {
      ok: false as const,
      hint: looksLikeStaleClient
        ? "Prisma client out of date — run npm run db:generate and restart the dev server."
        : "MySQL is not reachable. Start it from the XAMPP control panel.",
    };
  }
}

/** What the analyzer actually supports, kept in one place so the copy cannot drift. */
const MEASURES = [
  {
    title: "Language mix",
    body: "Byte and line share across 60 languages, detected by extension, then filename, then shebang. node_modules, build output, lockfiles and binaries are never counted.",
  },
  {
    title: "Lines of code",
    body: "Totals and a per-language breakdown, counted the way you would expect — CRLF is one line ending, and a file with no trailing newline still counts its last line.",
  },
  {
    title: "History",
    body: "Every upload is kept as a snapshot instead of overwriting the last, so lines, size and completion are charted as they move.",
  },
  {
    title: "Completion",
    body: "Derived from weighted tasks — a milestone can count for more than a chore — or set by hand when the percentage is a judgement call.",
  },
  {
    title: "Dependencies",
    body: "Read from package.json, requirements.txt, go.mod, Cargo.toml and composer.json, with declared ranges kept verbatim and dev, peer and optional scopes separated.",
  },
  {
    title: "Tech stack",
    body: "Front end, back end and database inferred from 84 rules across manifests and config files. Every guess shows its evidence, and you can keep it or dismiss it for good.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Drop in a folder or a .zip",
    body: "Drag a project onto the dashboard, or pick it with the folder chooser. A zip of the same tree measures identically.",
  },
  {
    n: "02",
    title: "It gets read, not kept",
    body: "The files are parsed in memory and discarded. What is saved is the measurements — counts, languages, dependencies — never your source.",
  },
  {
    n: "03",
    title: "Re-upload to see movement",
    body: "Each re-scan adds a snapshot. The charts, the dependency list and the detected stack all update, and the earlier numbers stay intact.",
  },
];

const LOCAL_POINTS = [
  {
    title: "Your source is never stored",
    body: "Uploads are parsed in memory and thrown away. The database holds counts, language names, dependency names and versions — scanning a 200 MB repository leaves behind about a kilobyte.",
  },
  {
    title: "Nothing is sent anywhere",
    body: "No telemetry, no analytics, and no fonts fetched at build time. One Next.js process and the MySQL server you already run.",
  },
  {
    title: "Accounts are for separation, not secrecy",
    body: "A sign-up is a standard user who sees only their own projects; an admin sees every account's. Passwords are hashed with bcrypt and the session is a signed, HttpOnly cookie.",
  },
];

/**
 * A miniature of the real language bar, drawn with the same validated palette
 * as the charts. Labelled as an example so it is never mistaken for the
 * reader's own data.
 */
function ExampleSnapshot() {
  const slices = [
    { language: "TypeScript", percent: 41.2, color: "var(--color-series-1)" },
    { language: "Shell", percent: 15.8, color: "var(--color-series-2)" },
    { language: "Python", percent: 12.4, color: "var(--color-series-3)" },
    { language: "CSS", percent: 9.1, color: "var(--color-series-4)" },
    { language: "Other", percent: 21.5, color: "var(--color-series-other)" },
  ];

  return (
    <figure className="lift rounded-xl border border-line bg-surface p-5">
      <figcaption className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-muted">Example snapshot</span>
        <span className="text-xs text-faint">not your data</span>
      </figcaption>

      <div className="mt-4 grid grid-cols-3 gap-4">
        {[
          { label: "Lines", value: "9,105" },
          { label: "Files", value: "121" },
          { label: "Complete", value: "72%" },
        ].map((stat) => (
          <div key={stat.label}>
            <p className="text-xs text-muted">{stat.label}</p>
            <p className="mt-0.5 text-xl font-semibold tracking-tight">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Same mark spec as the real chart: a 2px surface gap does the
          separating, never a stroke drawn around each segment. */}
      <div className="mt-5 flex h-4 w-full overflow-hidden rounded">
        {slices.map((slice, index) => (
          <div
            key={slice.language}
            style={{
              width: `${slice.percent}%`,
              backgroundColor: slice.color,
              marginLeft: index === 0 ? 0 : 2,
            }}
          />
        ))}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
        {slices.map((slice) => (
          <li key={slice.language} className="flex items-center gap-1.5 text-xs">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: slice.color }}
            />
            <span>{slice.language}</span>
            <span className="tabular text-muted">{slice.percent}%</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

export default async function Home() {
  const [user, database] = await Promise.all([
    getSessionUser(),
    databaseStatus(),
  ]);

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            DevTrack
          </Link>

          <nav className="flex items-center gap-3 text-sm">
            <ThemeToggle className="mr-1" />
            {user ? (
              <Link
                href="/dashboard"
                className="press rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink transition-opacity hover:opacity-90"
              >
                Open dashboard
              </Link>
            ) : (
              <>
                <Link href="/login" className="text-muted hover:text-accent">
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  className="press rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink transition-opacity hover:opacity-90"
                >
                  Create account
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-6 pb-16 pt-20">
          <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:items-center">
            <div className="rise">
              <p className="text-xs font-medium uppercase tracking-wider text-faint">
                Personal developer analytics
              </p>
              {/* No hardcoded break: at this column width a forced <br/> left
                  "codebase" orphaned on its own line. A max-width lets the
                  heading break where it actually fits. */}
              <h1 className="mt-3 max-w-[19ch] text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
                See what your codebase is actually made of.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-muted">
                DevTrack measures projects you already have. Drop in a folder or
                a <code className="font-mono text-sm">.zip</code> and it counts
                the lines, works out the language mix, reads your dependencies
                and infers the stack — then keeps every scan, so you can see how
                the work moves over time.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                {user ? (
                  <Link
                    href="/dashboard"
                    className="press rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90"
                  >
                    Open your dashboard
                  </Link>
                ) : (
                  <>
                    <Link
                      href="/signup"
                      className="press rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90"
                    >
                      Create an account
                    </Link>
                    <Link
                      href="/login"
                      className="press rounded-md border border-line px-4 py-2 text-sm transition-colors hover:border-accent hover:text-accent"
                    >
                      Sign in
                    </Link>
                  </>
                )}
              </div>

              <p className="mt-4 text-xs text-faint">
                Runs on localhost. Nothing is uploaded anywhere.
              </p>
            </div>

            <div className="rise" style={{ animationDelay: "120ms" }}>
              <ExampleSnapshot />
            </div>
          </div>
        </section>

        <section className="reveal border-t border-line">
          <div className="mx-auto w-full max-w-5xl px-6 py-16">
            <h2 className="text-xs font-medium uppercase tracking-wider text-faint">
              What it measures
            </h2>
            <dl className="stagger mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {MEASURES.map((item) => (
                <div key={item.title}>
                  <dt className="text-sm font-medium">{item.title}</dt>
                  <dd className="mt-1.5 text-sm leading-relaxed text-muted">
                    {item.body}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="reveal border-t border-line">
          <div className="mx-auto w-full max-w-5xl px-6 py-16">
            <h2 className="text-xs font-medium uppercase tracking-wider text-faint">
              How it works
            </h2>
            <ol className="stagger mt-8 grid gap-8 sm:grid-cols-3">
              {STEPS.map((step) => (
                <li key={step.n}>
                  <p className="font-mono text-xs text-accent">{step.n}</p>
                  <h3 className="mt-2 text-sm font-medium">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="reveal border-t border-line">
          <div className="mx-auto w-full max-w-5xl px-6 py-16">
            <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-start">
              <div>
                <h2 className="text-xs font-medium uppercase tracking-wider text-faint">
                  Local by design
                </h2>
                <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
                  This is not a service with a local mode. There is no account
                  anywhere but this machine, and no request leaves it.
                </p>
              </div>

              <ul className="stagger space-y-5">
                {LOCAL_POINTS.map((item) => (
                  <li key={item.title} className="border-l border-line pl-4">
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted">
                      {item.body}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {!user && (
          <section className="reveal border-t border-line">
            <div className="mx-auto w-full max-w-5xl px-6 py-16 text-center">
              <h2 className="text-2xl font-semibold tracking-tight">
                Point it at a project you already have.
              </h2>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
                The first scan takes a few seconds, and usually tells you
                something you did not already know about your own repository.
              </p>
              <div className="mt-7 flex items-center justify-center gap-3">
                <Link
                  href="/signup"
                  className="press rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90"
                >
                  Create an account
                </Link>
                <Link
                  href="/login"
                  className="press rounded-md border border-line px-4 py-2 text-sm transition-colors hover:border-accent hover:text-accent"
                >
                  Sign in
                </Link>
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-6 py-8 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p className="text-faint">
            DevTrack · Next.js, Prisma and MySQL, on this machine only.
          </p>

          {/* Kept from the old status page: the one thing genuinely worth
              surfacing here is whether the database is actually reachable. */}
          {database.ok ? (
            <p className="text-muted">
              <span className="text-accent">Database connected</span>
              <span className="text-faint"> · </span>
              <span className="font-mono">{database.version}</span>
              <span className="text-faint"> · </span>
              {database.accounts}{" "}
              {database.accounts === 1 ? "account" : "accounts"}
            </p>
          ) : (
            <p className="text-muted">
              <span className="font-medium">Database unavailable</span>
              <span className="text-faint"> · </span>
              {database.hint}
            </p>
          )}
        </div>
      </footer>
    </div>
  );
}
