import Link from "next/link";

/**
 * Also the response for a project that exists but belongs to someone else —
 * `getProjectDetail` returns null in both cases on purpose, so this page must
 * not hint that the id was real.
 */
export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-md px-6 py-24">
      <h1 className="text-lg font-medium tracking-tight">Not found</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        That page does not exist, or it belongs to another account.
      </p>
      <p className="mt-6">
        <Link href="/dashboard" className="text-sm text-accent hover:underline">
          Back to dashboard
        </Link>
      </p>
    </main>
  );
}
