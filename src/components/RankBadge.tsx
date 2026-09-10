/**
 * Rank marker for a leaderboard row.
 *
 * The top three get a drawn badge — a crown for first, a medal for second and
 * third — and everyone else gets their number. Inline SVG rather than emoji:
 * emoji render differently on every platform, cannot take a theme colour, and
 * 🥇 is announced as "1st place medal" whether or not that is the label you
 * wanted.
 *
 * The colours come from --color-rank-* tokens, which sit outside the
 * categorical series scale so a badge can never be mistaken for a data series.
 */

const LABELS = ["1st", "2nd", "3rd"] as const;

/**
 * Written out rather than built with `var(--color-rank-${n})`.
 *
 * An interpolated name never appears literally in the source, and Tailwind v4
 * only keeps a @theme variable whose name it can see there — which silently
 * dropped these from the light-mode CSS and left every badge unpainted. The
 * tokens now live in plain CSS, and spelling them out here keeps the reference
 * greppable.
 */
const RANK_COLORS = [
  "var(--color-rank-1)",
  "var(--color-rank-2)",
  "var(--color-rank-3)",
] as const;

function Crown({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 8.5l3.2 2.6L9.5 5l2.5 4.2L14.5 5l3.3 6.1L21 8.5l-1.6 9.5H4.6L3 8.5z" />
      <path d="M4.6 18h14.8" />
    </svg>
  );
}

/**
 * Second and third place as a filled disc carrying the numeral.
 *
 * A drawn medal was tried first and rejected: at 16px the ribbons and disc
 * merge into an unreadable glyph. A numbered disc is unambiguous at any size
 * and still carries the silver/bronze metaphor through its colour.
 *
 * The numeral is painted in the surface colour, which gives 4.8:1 on silver
 * and 5.4:1 on bronze in light mode, and 9.3:1 / 6.1:1 in dark.
 */
function NumberDisc({ color, rank }: { color: string; rank: number }) {
  return (
    <span
      aria-hidden
      className="tabular flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold leading-none"
      style={{ backgroundColor: color, color: "var(--color-surface)" }}
    >
      {rank}
    </span>
  );
}

export function RankBadge({ index }: { index: number }) {
  const color = RANK_COLORS[index] ?? RANK_COLORS[2];

  if (index > 2) {
    return (
      <span className="tabular w-5 shrink-0 text-center text-xs text-faint">
        {index + 1}
      </span>
    );
  }

  return (
    <span
      className="flex w-5 shrink-0 items-center justify-center"
      // The icon is decorative; the rank is the information, so it is the
      // title that carries it for a screen reader.
      title={`${LABELS[index]} place`}
    >
      <span className="sr-only">{LABELS[index]} place</span>
      {index === 0 ? (
        <Crown color={color} />
      ) : (
        <NumberDisc color={color} rank={index + 1} />
      )}
    </span>
  );
}
