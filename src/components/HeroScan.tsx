/**
 * The hero: a scan log that types itself out and then becomes the snapshot it
 * produced.
 *
 * It animates the product's own claim — source goes in, measurements come out,
 * the source is not kept — so it carries information rather than decorating.
 * The numbers in the log are the same ones the card reports, because a log
 * that counted 121 files next to a card claiming 340 would be worse than no
 * animation at all.
 *
 * A server component with no client JavaScript: the whole sequence is CSS,
 * timed with per-line delays computed here. See the hero block in globals.css
 * for why the typing uses clip-path.
 */

/** Keeps the log and the card from ever disagreeing. */
const SNAPSHOT = {
  files: 121,
  lines: 9105,
  completion: 72,
  languages: [
    { language: "TypeScript", percent: 41.2, color: "var(--color-series-1)" },
    { language: "Shell", percent: 15.8, color: "var(--color-series-2)" },
    { language: "Python", percent: 12.4, color: "var(--color-series-3)" },
    { language: "CSS", percent: 9.1, color: "var(--color-series-4)" },
    { language: "Other", percent: 21.5, color: "var(--color-series-other)" },
  ],
} as const;

type LogLine = { text: string; tone: "prompt" | "path" | "note" };

const LOG: LogLine[] = [
  { text: "$ devtrack scan ./example-app", tone: "prompt" },
  { text: `reading ${SNAPSHOT.files} files…`, tone: "note" },
  { text: "  src/server.ts        TypeScript", tone: "path" },
  { text: "  scripts/deploy.sh    Shell", tone: "path" },
  { text: "  etl/ingest.py        Python", tone: "path" },
  { text: "  ui/theme.css         CSS", tone: "path" },
  { text: `counted ${SNAPSHOT.lines.toLocaleString()} lines`, tone: "note" },
  { text: "discarding source…", tone: "note" },
];

// Timing. Each line types at a fixed rate, and the next starts before the
// previous finishes — a strict queue reads as sluggish.
const CHAR_MS = 11;
const LINE_STAGGER_MS = 190;
const MIN_LINE_MS = 260;

/**
 * Wait for the splash to get out of the way.
 *
 * The CSS-only splash covers the first paint and fades out over 620–980ms, so
 * a sequence starting at 0 spends its first second playing behind an opaque
 * overlay — the reader arrives partway through a half-typed log with no idea
 * it was being typed. This offset lines the first keystroke up with the splash
 * clearing. It must stay above the splash's own 620ms + 360ms.
 */
const START_MS = 1000;

const lineDuration = (text: string) =>
  Math.max(MIN_LINE_MS, text.length * CHAR_MS);

const lineDelay = (index: number) => START_MS + index * LINE_STAGGER_MS;

const lastLineEnd = LOG.reduce(
  (latest, line, index) =>
    Math.max(latest, lineDelay(index) + lineDuration(line.text)),
  0,
);

/** A beat to read the finished log before it becomes the card. */
const SWAP_AT = lastLineEnd + 420;
const SWAP_MS = 460;

const TONE_CLASS: Record<LogLine["tone"], string> = {
  prompt: "text-accent",
  path: "text-muted",
  note: "text-faint",
};

function ScanLog() {
  return (
    <div
      // Hidden from assistive tech and from search: it is an animated
      // decoration of the card beside it, and the card carries the real
      // content. A screen reader announcing a fake terminal session would be
      // noise, and it would read as though it were the user's own project.
      aria-hidden
      className="pointer-events-none rounded-xl border border-line bg-surface p-5"
      style={{
        animation: `devtrack-scan-out ${SWAP_MS}ms ease-out ${SWAP_AT}ms forwards`,
      }}
    >
      <div className="flex items-center gap-1.5">
        {["#e34948", "#eda100", "#1baf7a"].map((dot) => (
          <span
            key={dot}
            className="inline-block h-2 w-2 rounded-full opacity-60"
            style={{ backgroundColor: dot }}
          />
        ))}
        <span className="ml-1.5 font-mono text-[10px] text-faint">
          devtrack
        </span>
      </div>

      <pre className="mt-4 overflow-hidden font-mono text-[11px] leading-[1.75] sm:text-xs">
        {LOG.map((line, index) => {
          const chars = Math.max(1, line.text.length);
          const duration = lineDuration(line.text);
          return (
            <span key={line.text} className="block">
              <span
                className={`inline-block ${TONE_CLASS[line.tone]}`}
                style={{
                  animation: `devtrack-type ${duration}ms steps(${chars}) ${lineDelay(index)}ms both`,
                }}
              >
                {line.text}
                {/* Inside the clipped span, not after it. A clip-path does not
                    change layout, so a caret placed outside sits at the end of
                    the line's full width — floating in blank space above the
                    text that has not been revealed yet. In here it is uncovered
                    by the final step of the reveal, which is exactly when a
                    real cursor would arrive. */}
                {index === LOG.length - 1 && (
                  <span
                    className="ml-0.5 inline-block h-[1em] w-[0.5em] translate-y-[0.15em] bg-accent align-baseline"
                    style={{
                      animation: `devtrack-caret 900ms steps(1, end) ${
                        lineDelay(index) + duration
                      }ms infinite`,
                    }}
                  />
                )}
              </span>
            </span>
          );
        })}
      </pre>
    </div>
  );
}

/**
 * A miniature of the real language bar, drawn with the same validated palette
 * as the charts. Labelled as an example so it is never mistaken for the
 * reader's own data.
 */
function ExampleSnapshot() {
  return (
    <figure
      className="lift rounded-xl border border-line bg-surface p-5"
      style={{
        animation: `devtrack-scan-in ${SWAP_MS}ms cubic-bezier(0.22, 1, 0.36, 1) ${
          SWAP_AT + 120
        }ms both`,
      }}
    >
      <figcaption className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-muted">Example snapshot</span>
        <span className="text-xs text-faint">not your data</span>
      </figcaption>

      <div className="mt-4 grid grid-cols-3 gap-4">
        {[
          { label: "Lines", value: SNAPSHOT.lines.toLocaleString() },
          { label: "Files", value: String(SNAPSHOT.files) },
          { label: "Complete", value: `${SNAPSHOT.completion}%` },
        ].map((stat) => (
          <div key={stat.label}>
            <p className="text-xs text-muted">{stat.label}</p>
            <p className="mt-0.5 text-xl font-semibold tracking-tight">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Same mark spec as the real chart: a 2px surface gap does the
          separating, never a stroke drawn around each segment. */}
      <div className="mt-5 flex h-4 w-full overflow-hidden rounded">
        {SNAPSHOT.languages.map((slice, index) => (
          <div
            key={slice.language}
            style={{
              width: `${slice.percent}%`,
              backgroundColor: slice.color,
              marginLeft: index === 0 ? 0 : 2,
            }}
          />
        ))}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
        {SNAPSHOT.languages.map((slice) => (
          <li key={slice.language} className="flex items-center gap-1.5 text-xs">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: slice.color }}
            />
            <span>{slice.language}</span>
            <span className="tabular text-muted">{slice.percent}%</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

export function HeroScan() {
  return (
    // Both layers occupy the same grid cell, so the box is always as tall as
    // the taller one and the swap causes no shift.
    <div className="grid [&>*]:col-start-1 [&>*]:row-start-1">
      <ScanLog />
      <ExampleSnapshot />
    </div>
  );
}
