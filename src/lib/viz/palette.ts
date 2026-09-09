// Colour assignment for charts.
//
// Two rules pull against each other here and it is worth being explicit about
// how they are resolved:
//
//   1. Slots must be assigned in the palette's documented order, because that
//      order is what makes adjacent marks colourblind-safe. Skipping around
//      can seat yellow next to orange, which fails the separation floor.
//   2. A colour must follow the entity, not its rank, or a language changes
//      colour between charts and the reader is misled.
//
// The resolution: assignment is computed ONCE per project, from every language
// across every snapshot ordered by total bytes. Consecutive slots keep rule 1;
// computing it project-wide rather than per-chart keeps rule 2 — TypeScript is
// the same colour in the language bar, the trend area, and the table, and it
// stays that colour as new snapshots arrive. It can only move if a language's
// all-time byte ranking changes, which is a deliberate, explainable trade.

/** Categorical slots, in the order they must be handed out. */
export const SERIES_SLOTS = [
  "var(--color-series-1)",
  "var(--color-series-2)",
  "var(--color-series-3)",
  "var(--color-series-4)",
  "var(--color-series-5)",
  "var(--color-series-6)",
  "var(--color-series-7)",
] as const;

export const OTHER_COLOR = "var(--color-series-other)";
export const OTHER_LABEL = "Other";

/**
 * Past this many languages the tail folds into "Other". Seven named slots plus
 * a grey tail — never a generated eighth hue, which would be indistinguishable
 * under CVD.
 */
export const MAX_NAMED_LANGUAGES = SERIES_SLOTS.length;

export type LanguageColorMap = Map<string, string>;

/**
 * Builds the project-wide language → colour map. `totals` must be every
 * language across every snapshot, so the mapping does not depend on which
 * snapshot is being drawn.
 */
export function assignLanguageColors(
  totals: Array<{ language: string; bytes: number }>,
): LanguageColorMap {
  const byBytes = new Map<string, number>();
  for (const row of totals) {
    byBytes.set(row.language, (byBytes.get(row.language) ?? 0) + row.bytes);
  }

  const ranked = [...byBytes.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    // Ties must break deterministically or colours flicker between requests.
    return a[0].localeCompare(b[0]);
  });

  const map: LanguageColorMap = new Map();
  ranked.forEach(([language], index) => {
    map.set(
      language,
      index < MAX_NAMED_LANGUAGES ? SERIES_SLOTS[index] : OTHER_COLOR,
    );
  });
  map.set(OTHER_LABEL, OTHER_COLOR);

  return map;
}

/** The languages that get their own name and colour, in slot order. */
export function namedLanguages(colors: LanguageColorMap): string[] {
  return [...colors.entries()]
    .filter(([language, color]) => language !== OTHER_LABEL && color !== OTHER_COLOR)
    .map(([language]) => language);
}

/**
 * Collapses a snapshot's language rows to the named set plus an "Other"
 * bucket, ordered by the slot order so a stacked mark's neighbours are always
 * adjacent slots.
 */
export function foldToNamed<T extends { language: string; bytes: number; lines: number }>(
  rows: T[],
  colors: LanguageColorMap,
): Array<{ language: string; bytes: number; lines: number; color: string }> {
  const named = namedLanguages(colors);
  const namedSet = new Set(named);

  const out = named
    .map((language) => {
      const row = rows.find((r) => r.language === language);
      return {
        language,
        bytes: row?.bytes ?? 0,
        lines: row?.lines ?? 0,
        color: colors.get(language) ?? OTHER_COLOR,
      };
    })
    .filter((row) => row.bytes > 0);

  const tail = rows.filter((r) => !namedSet.has(r.language));
  if (tail.length > 0) {
    out.push({
      language: OTHER_LABEL,
      bytes: tail.reduce((sum, r) => sum + r.bytes, 0),
      lines: tail.reduce((sum, r) => sum + r.lines, 0),
      color: OTHER_COLOR,
    });
  }

  return out;
}

export function percentOf(value: number, total: number): number {
  if (total <= 0) return 0;
  return (value / total) * 100;
}
