"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Route error boundary. Server component errors reach the browser with their
 * message stripped in production, so the digest is shown instead — it is the
 * only way to tie what the reader saw to the line in the server log.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Local-only app: the terminal running `npm run dev` is the log.
    console.error("Page failed to render:", error);
  }, [error]);

  const looksLikeDatabase =
    /ECONNREFUSED|connect|pool|Access denied|Unknown database/i.test(
      error.message,
    );

  return (
    <main className="mx-auto w-full max-w-md px-6 py-24">
      <h1 className="text-lg font-medium tracking-tight">
        Something went wrong
      </h1>

      <p className="mt-2 text-sm leading-relaxed text-muted">
        {looksLikeDatabase
          ? "DevTrack could not reach MySQL. Start it from the XAMPP control panel, then try again."
          : "This page could not be rendered. The full error is in the terminal running the dev server."}
      </p>

      {error.digest && (
        <p className="mt-3 font-mono text-xs text-faint">
          digest {error.digest}
        </p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink transition-opacity hover:opacity-90"
        >
          Try again
        </button>
        <Link href="/dashboard" className="text-xs text-muted hover:text-accent">
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
