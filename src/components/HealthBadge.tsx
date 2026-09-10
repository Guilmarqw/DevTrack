import { HEALTH_COLOR, type Health } from "@/lib/health";

/**
 * The health indicator, as a dot and a word.
 *
 * The colour is never the only carrier — the label says the same thing in
 * text, so the badge survives a monochrome screen and a colour-blind reader.
 * The dot is `aria-hidden` for the same reason: it adds nothing a screen
 * reader cannot already get from the label.
 */
export function HealthBadge({
  health,
  size = "md",
}: {
  health: Health;
  size?: "sm" | "md";
}) {
  const color = HEALTH_COLOR[health.level];

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface ${
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
      }`}
      title={health.detail}
    >
      <span
        aria-hidden
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="font-medium" style={{ color }}>
        {health.label}
      </span>
    </span>
  );
}
