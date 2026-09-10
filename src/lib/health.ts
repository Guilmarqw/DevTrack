import type { FindingSeverity } from "@/generated/prisma/enums";

/**
 * A project's health, derived from the findings on its latest snapshot.
 *
 * Deliberately **not a score**. A number out of 100 would need weights — is an
 * unignored .env worth 20 points or 40? — and every one of them would be
 * invented. Nothing in the data says how to trade a broken YAML file against a
 * missing README, so the indicator reports the worst thing found and the
 * counts behind it, and lets the reader do the trading.
 *
 * `detail` always states what the level was derived from, so the badge is
 * never a verdict you cannot check.
 */

export type HealthLevel = "UNSCANNED" | "ATTENTION" | "MINOR" | "CLEAN";

export type Health = {
  level: HealthLevel;
  label: string;
  detail: string;
  counts: { errors: number; warnings: number; notes: number };
};

/** Plain `:root` tokens, so these are read through var() not a Tailwind class. */
export const HEALTH_COLOR: Record<HealthLevel, string> = {
  UNSCANNED: "var(--color-faint)",
  ATTENTION: "var(--color-sev-error)",
  MINOR: "var(--color-sev-warn)",
  CLEAN: "var(--color-sev-ok)",
};

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function projectHealth(input: {
  scanned: boolean;
  findings: Array<{ severity: FindingSeverity }>;
}): Health {
  const counts = {
    errors: input.findings.filter((f) => f.severity === "ERROR").length,
    warnings: input.findings.filter((f) => f.severity === "WARN").length,
    notes: input.findings.filter((f) => f.severity === "INFO").length,
  };

  // Rows before the flag, matching the Findings panel: their existence proves
  // a scan ran, which keeps this right for a snapshot written between the
  // findings feature and the flag that records it.
  if (input.findings.length === 0 && !input.scanned) {
    return {
      level: "UNSCANNED",
      label: "Not scanned",
      detail:
        "This snapshot predates findings, so nothing has been checked. Re-scan to find out.",
      counts,
    };
  }

  if (counts.errors > 0) {
    return {
      level: "ATTENTION",
      label: "Needs attention",
      detail: `${plural(counts.errors, "error", "errors")} in the latest scan.`,
      counts,
    };
  }

  if (counts.warnings > 0) {
    return {
      level: "MINOR",
      label: "Minor issues",
      detail: `No errors, ${plural(counts.warnings, "warning", "warnings")}.`,
      counts,
    };
  }

  return {
    level: "CLEAN",
    label: "No issues found",
    detail:
      counts.notes > 0
        ? `No errors or warnings, ${plural(counts.notes, "note", "notes")}.`
        : "Every checked file parses and the hygiene checks pass.",
    counts,
  };
}
