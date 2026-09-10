/**
 * The loading screen that covers the first paint of a full page load.
 *
 * Server-rendered on purpose: building it from client state would either flash
 * the page underneath first or mismatch during hydration. Its own CSS
 * animation fades it out and leaves it inert — see #devtrack-splash in
 * globals.css — so there is no JavaScript in this path at all. Nothing removes
 * the node, because it is React's to own.
 */
export function SplashMarkup() {
  const bars = [
    { color: "var(--color-series-1)", delay: "0ms", height: "100%" },
    { color: "var(--color-series-2)", delay: "120ms", height: "72%" },
    { color: "var(--color-series-3)", delay: "240ms", height: "88%" },
    { color: "var(--color-series-4)", delay: "360ms", height: "56%" },
    { color: "var(--color-series-other)", delay: "480ms", height: "40%" },
  ];

  return (
    <div
      id="devtrack-splash"
      // Decorative chrome over content that is already in the DOM for a
      // screen reader, so it is hidden from the accessibility tree.
      aria-hidden
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-canvas"
    >
      <div className="flex h-10 items-end gap-1.5">
        {bars.map((bar) => (
          <span
            key={bar.delay}
            className="boot-bar w-2 rounded-sm"
            style={{
              height: bar.height,
              backgroundColor: bar.color,
              animationDelay: bar.delay,
            }}
          />
        ))}
      </div>
      <p className="text-xs tracking-wide text-faint">DevTrack</p>
    </div>
  );
}
