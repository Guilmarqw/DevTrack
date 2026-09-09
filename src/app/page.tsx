import Link from "next/link";
import { db } from "@/lib/db";

// Rendered per request so the check reflects the database's state right now,
// not whatever was true at build time.
export const dynamic = "force-dynamic";

async function checkDatabase() {
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
    // second one looks nothing like a connection failure and blaming XAMPP for
    // it sends you looking in the wrong place.
    const looksLikeStaleClient = /reading '(\w+)'|is not a function/.test(
      message,
    );
    return {
      ok: false as const,
      message,
      hint: looksLikeStaleClient
        ? "The generated Prisma client is out of date. Run npm run db:generate and restart the dev server."
        : "Start MySQL in the XAMPP control panel, then reload.",
    };
  }
}

const PHASES = [
  { n: 1, name: "Scaffolding", done: true },
  { n: 2, name: "Prisma schema + seed", done: true },
  { n: 3, name: "Auth", done: true },
  { n: 4, name: "Upload pipeline", done: true },
  { n: 5, name: "Dashboard UI", done: false },
  { n: 6, name: "Tech + dependency detection", done: false },
  { n: 7, name: "Polish", done: false },
];

export default async function Home() {
  const database = await checkDatabase();

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-20">
      <h1 className="text-2xl font-medium tracking-tight">DevTrack</h1>
      <p className="mt-2 text-sm text-muted">
        Personal developer analytics. Running locally, for one person.
      </p>
      <p className="mt-4 text-sm">
        <Link href="/login" className="text-accent hover:underline">
          Sign in
        </Link>
        <span className="text-faint"> or </span>
        <Link href="/signup" className="text-accent hover:underline">
          create an account
        </Link>
      </p>

      <section className="mt-12">
        <h2 className="text-xs font-medium uppercase tracking-wider text-faint">
          Database
        </h2>
        <div className="mt-3 rounded-lg border border-line bg-surface px-4 py-3">
          {database.ok ? (
            <p className="text-sm">
              <span className="text-accent">Connected</span>
              <span className="text-faint"> · </span>
              <span className="font-mono text-xs text-muted">
                {database.version}
              </span>
              <span className="text-faint"> · </span>
              <span className="text-xs text-muted">
                {database.accounts}{" "}
                {database.accounts === 1 ? "account" : "accounts"}
              </span>
            </p>
          ) : (
            <div className="text-sm">
              <p className="font-medium">Not connected</p>
              <p className="mt-1 font-mono text-xs leading-relaxed text-muted">
                {database.message}
              </p>
              <p className="mt-2 text-xs text-muted">{database.hint}</p>
            </div>
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xs font-medium uppercase tracking-wider text-faint">
          Build progress
        </h2>
        <ol className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {PHASES.map((phase) => (
            <li
              key={phase.n}
              className="flex items-center gap-3 px-4 py-2.5 text-sm"
            >
              <span className="w-4 font-mono text-xs text-faint">
                {phase.n}
              </span>
              <span className={phase.done ? "" : "text-muted"}>
                {phase.name}
              </span>
              {phase.done && (
                <span className="ml-auto text-xs text-accent">done</span>
              )}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
