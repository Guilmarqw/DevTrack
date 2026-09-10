"use client";

import { cursorIndex, type UploadFile } from "@/lib/uploadCursor";

export type { UploadFile };

/**
 * A live scan log for an upload in progress.
 *
 * Deliberately not a decorative animation. The client already holds every
 * file's relative path and byte size, and XHR reports real bytes sent, so the
 * paths scrolling past are the actual files going over the wire in the actual
 * order they were queued. A fake typing effect would look identical and tell
 * the reader nothing.
 *
 * The one approximation is *which* file is in flight: multipart framing means
 * bytes-sent does not map exactly onto the sum of file sizes, so the cursor is
 * derived from the fraction of the body sent. It is right to within a file or
 * two, which is why nothing here claims a file has finished uploading — the
 * panel says "sending", and the counter beside it is exact.
 */

const WINDOW = 6;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadScanLog({
  manifest,
  fraction,
  done = false,
}: {
  manifest: UploadFile[];
  /** How much of the request body has been sent, 0–1. */
  fraction: number;
  /** Server-side phase: nothing more is going over the wire. */
  done?: boolean;
}) {
  if (manifest.length === 0) return null;

  const index = done ? manifest.length - 1 : cursorIndex(manifest, fraction);
  const start = Math.max(0, index - (WINDOW - 1));
  const visible = manifest.slice(start, index + 1);

  return (
    <div
      // The counters and phase label in UploadProgress carry this for a screen
      // reader already, and that region is aria-live. A log of paths repeating
      // every few hundred milliseconds would flood it.
      aria-hidden
      className="mt-3 overflow-hidden rounded-md border border-line bg-canvas px-3 py-2"
    >
      <pre className="font-mono text-[10.5px] leading-[1.7] text-muted">
        {visible.map((file, i) => {
          const isCurrent = !done && i === visible.length - 1;
          return (
            <span key={`${start + i}-${file.path}`} className="fade block truncate">
              <span className={isCurrent ? "text-accent" : "text-faint"}>
                {isCurrent ? "› " : "  "}
              </span>
              {file.path}
              <span className="text-faint"> · {formatSize(file.size)}</span>
              {isCurrent && (
                <span
                  className="ml-1 inline-block h-[0.95em] w-[0.45em] translate-y-[0.12em] bg-accent align-baseline"
                  style={{ animation: "devtrack-caret 900ms steps(1, end) infinite" }}
                />
              )}
            </span>
          );
        })}
        {done && (
          <span className="fade block text-faint">
            {"  "}counting lines and reading manifests…
            <span
              className="ml-1 inline-block h-[0.95em] w-[0.45em] translate-y-[0.12em] bg-accent align-baseline"
              style={{ animation: "devtrack-caret 900ms steps(1, end) infinite" }}
            />
          </span>
        )}
      </pre>
    </div>
  );
}
