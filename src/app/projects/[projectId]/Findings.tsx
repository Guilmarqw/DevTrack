import type { FindingSeverity } from "@/generated/prisma/enums";

/**
 * What the latest scan found wrong.
 *
 * A server component: there is nothing to interact with, and the whole panel
 * must be present in the HTML so Ctrl+F finds a filename in it.
 *
 * The severity colours are read through `var()` rather than a Tailwind class
 * because these tokens live in plain `:root`, not `@theme` — see the comment
 * beside them in globals.css. The map is written out literally for the same
 * reason RankBadge's is: a computed variable name is invisible to Tailwind's
 * scanner and silently resolves to nothing.
 */
const SEVERITY_STYLE: Record<
  FindingSeverity,
  { label: string; color: string }
> = {
  ERROR: { label: "Error", color: "var(--color-sev-error)" },
  WARN: { label: "Warning", color: "var(--color-sev-warn)" },
  INFO: { label: "Note", color: "var(--color-muted)" },
};

export type FindingRow = {
  id: string;
  rule: string;
  severity: FindingSeverity;
  title: string;
  detail: string;
  path: string | null;
};

function countOf(rows: FindingRow[], severity: FindingSeverity): number {
  return rows.filter((row) => row.severity === severity).length;
}

/** "1 error · 2 warnings · 3 notes", omitting whichever are zero. */
function summarise(rows: FindingRow[]): string {
  const parts: string[] = [];
  const errors = countOf(rows, "ERROR");
  const warnings = countOf(rows, "WARN");
  const notes = countOf(rows, "INFO");

  if (errors) parts.push(`${errors} ${errors === 1 ? "error" : "errors"}`);
  if (warnings) {
    parts.push(`${warnings} ${warnings === 1 ? "warning" : "warnings"}`);
  }
  if (notes) parts.push(`${notes} ${notes === 1 ? "note" : "notes"}`);

  return parts.join(" · ");
}

export function Findings({
  rows,
  scanned,
}: {
  rows: FindingRow[];
  scanned: boolean;
}) {
  // "Nothing found" and "never looked" must not read the same. A snapshot
  // taken before findings existed has an empty set for the second reason, and
  // claiming its files all parse would be a plain untruth.
  //
  // Rows are checked first because their existence is itself proof a scan ran:
  // that keeps the panel right for a snapshot written between the findings
  // feature and the flag that records it.
  if (rows.length === 0) {
    if (scanned) {
      return (
        <p className="max-w-2xl text-xs leading-relaxed text-muted">
          Nothing to report: every JSON, YAML and schema file in the latest
          snapshot parses, and the hygiene checks all pass. This does not mean
          the code is correct — DevTrack does not compile or lint it.
        </p>
      );
    }

    return (
      <div className="max-w-2xl">
        <p className="text-xs leading-relaxed text-muted">
          This snapshot was taken before DevTrack checked for findings, so it
          has not been scanned — which is not the same as being clean.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Checking it needs the folder again. The measurements are stored but
          your source never was, so there is nothing on this machine left to
          re-read — a scan has to see the files.
        </p>
        <a
          href="#add-files"
          className="press mt-3 inline-block rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink transition-opacity hover:opacity-90"
        >
          Check health
        </a>
      </div>
    );
  }

  return (
    <div>
      <p className="tabular text-xs text-muted">{summarise(rows)}</p>

      <ul className="stagger mt-3 space-y-2.5">
        {rows.map((row) => {
          const style = SEVERITY_STYLE[row.severity];
          return (
            <li
              key={row.id}
              className="rounded-lg border border-line bg-surface px-4 py-3"
              // A 2px rule in the severity colour, so the panel is scannable
              // without relying on the small label being read.
              style={{ borderLeftWidth: "2px", borderLeftColor: style.color }}
            >
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span
                  className="text-[10px] font-medium uppercase tracking-wide"
                  style={{ color: style.color }}
                >
                  {style.label}
                </span>
                <span className="text-sm font-medium">{row.title}</span>
                {row.path && (
                  <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-muted">
                    {row.path}
                  </code>
                )}
              </div>
              <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-muted">
                {row.detail}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
