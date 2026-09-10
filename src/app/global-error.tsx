"use client";

/**
 * Last resort: an error in the root layout itself, where the normal error
 * boundary cannot render because the layout it lives in is the broken thing.
 * It must therefore ship its own <html> and <body>, and cannot use the app's
 * theme tokens — globals.css may not have loaded.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Arial, sans-serif',
          backgroundColor: "#fbfbfa",
          color: "#1a1a18",
        }}
      >
        <main style={{ maxWidth: "28rem", padding: "0 1.5rem" }}>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 500, margin: 0 }}>
            DevTrack could not start
          </h1>
          <p style={{ fontSize: "0.875rem", lineHeight: 1.6, color: "#6b6b66" }}>
            The root layout failed to render. Check the terminal running the dev
            server for the full error.
          </p>
          {error.digest && (
            <p style={{ fontSize: "0.75rem", color: "#9a9a94" }}>
              digest {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
