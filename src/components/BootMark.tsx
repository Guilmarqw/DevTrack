/**
 * The animated mark used by the splash and the auth overlay: five bars that
 * rise and fall, echoing the language bar the product is actually about.
 *
 * Pure markup with staggered CSS delays, so it costs no JavaScript and starts
 * animating on first paint.
 */
export function BootMark({ className = "" }: { className?: string }) {
  const bars = [
    { color: "var(--color-series-1)", delay: "0ms", height: "100%" },
    { color: "var(--color-series-2)", delay: "120ms", height: "72%" },
    { color: "var(--color-series-3)", delay: "240ms", height: "88%" },
    { color: "var(--color-series-4)", delay: "360ms", height: "56%" },
    { color: "var(--color-series-other)", delay: "480ms", height: "40%" },
  ];

  return (
    <div
      aria-hidden
      className={`flex h-8 items-end gap-1 ${className}`}
    >
      {bars.map((bar) => (
        <span
          key={bar.color + bar.delay}
          className="boot-bar w-1.5 rounded-sm"
          style={{
            height: bar.height,
            backgroundColor: bar.color,
            animationDelay: bar.delay,
          }}
        />
      ))}
    </div>
  );
}
