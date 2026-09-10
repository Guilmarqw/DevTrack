"use client";

import { BootMark } from "./BootMark";

export type UploadPhase =
  | { kind: "idle" }
  | { kind: "uploading"; sentBytes: number; totalBytes: number; files: number }
  | { kind: "analysing"; totalBytes: number; files: number };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Two-phase upload feedback.
 *
 * Uploads have no size cap, so "please wait" is not good enough — a multi-GB
 * folder can take minutes and a reader needs to know it is still moving. The
 * first phase reports real bytes sent, which is knowable. The second is
 * genuinely indeterminate: the server is streaming and counting, and there is
 * no honest percentage for it, so it gets a moving bar rather than a fake one.
 */
export function UploadProgress({ phase }: { phase: UploadPhase }) {
  if (phase.kind === "idle") return null;

  const uploading = phase.kind === "uploading";
  const percent = uploading
    ? phase.totalBytes > 0
      ? Math.min(100, (phase.sentBytes / phase.totalBytes) * 100)
      : 0
    : 100;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fade mt-3 rounded-lg border border-line bg-surface px-4 py-3"
    >
      <div className="flex items-center gap-3">
        <BootMark className="h-5" />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {uploading ? "Uploading…" : "Analysing…"}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted">
            {uploading ? (
              <>
                {formatBytes(phase.sentBytes)} of{" "}
                {formatBytes(phase.totalBytes)}
                <span className="text-faint"> · </span>
                {phase.files.toLocaleString()}{" "}
                {phase.files === 1 ? "file" : "files"}
              </>
            ) : (
              <>
                Counting lines and reading manifests across{" "}
                {phase.files.toLocaleString()}{" "}
                {phase.files === 1 ? "file" : "files"}. Large projects take a
                while.
              </>
            )}
          </p>
        </div>

        {uploading && (
          <span className="tabular shrink-0 text-sm font-medium">
            {percent.toFixed(0)}%
          </span>
        )}
      </div>

      {/* Determinate while bytes are measurable, then a moving bar because the
          server phase has no honest percentage. */}
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-line">
        {uploading ? (
          <div
            className="h-full rounded-full transition-[width] duration-200 ease-out"
            style={{
              width: `${percent}%`,
              backgroundColor: "var(--color-accent)",
            }}
          />
        ) : (
          <div className="route-progress relative h-full w-full" />
        )}
      </div>
    </div>
  );
}
