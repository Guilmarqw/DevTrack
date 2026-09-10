"use client";

import { useState } from "react";
import { RankBadge } from "@/components/RankBadge";
import { languageFacts } from "@/lib/languageInfo";
import type { LanguageLeader } from "@/lib/analytics";

/**
 * Head-to-head standings per language.
 *
 * The summary list only ever names a winner, which hides whether they won by
 * a mile or by four lines. This shows the whole field for one language at a
 * time — a picker rather than every language expanded, because with a dozen
 * languages the page would otherwise be a wall of near-identical bars.
 */
/**
 * Rounding must never turn a real contribution into "none", or a partial lead
 * into a clean sweep. 3 lines out of 5,080 is 0.06%, which `toFixed(0)` prints
 * as "0%" beside a bar that is visibly not empty; the winner of that same
 * split rounds up to "100%" while two other accounts are still listed. Both
 * are clamped to a qualifier instead, and only a true 0 or 100 prints bare.
 */
function formatShare(share: number) {
  if (share > 0 && share < 1) return "<1%";
  if (share < 100 && share > 99) return ">99%";
  return `${share.toFixed(0)}%`;
}

export function LanguageStandings({ leaders }: { leaders: LanguageLeader[] }) {
  const [selected, setSelected] = useState(leaders[0]?.language ?? null);

  if (leaders.length === 0) {
    return (
      <p className="text-xs text-muted">
        No languages detected across any account yet.
      </p>
    );
  }

  const active = leaders.find((l) => l.language === selected) ?? leaders[0];
  const facts = languageFacts(active.language);
  const max = Math.max(1, ...active.standings.map((s) => s.lines));

  return (
    <div>
      {/* Contested languages first: a language two people write in is the
          interesting comparison. */}
      <div
        role="tablist"
        aria-label="Language"
        className="-mx-1 flex flex-wrap gap-1"
      >
        {leaders.map((leader) => {
          const isActive = leader.language === active.language;
          return (
            <button
              key={leader.language}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setSelected(leader.language)}
              className={`press rounded-full border px-2.5 py-1 text-xs transition-colors ${
                isActive
                  ? "border-accent bg-accent-soft font-medium text-accent"
                  : "border-line text-muted hover:border-accent hover:text-accent"
              }`}
            >
              {leader.language}
              {leader.contenders > 1 && (
                <span className="tabular ml-1.5 text-faint">
                  {leader.contenders}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4 rounded-lg border border-line bg-surface px-4 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium">{active.language}</h3>
          <p className="tabular text-xs text-muted">
            {active.totalLines.toLocaleString()} lines across{" "}
            {active.contenders}{" "}
            {active.contenders === 1 ? "account" : "accounts"}
          </p>
        </div>

        {facts && (
          <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-muted">
            {facts.summary}
          </p>
        )}

        <ol className="mt-4 space-y-3">
          {active.standings.map((standing, index) => (
            <li key={standing.userId}>
              <div className="flex items-baseline gap-2">
                <RankBadge index={index} />
                <span
                  className={`text-sm ${standing.isViewer ? "font-medium" : ""}`}
                >
                  {standing.displayName}
                </span>
                {standing.isViewer && (
                  <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
                    you
                  </span>
                )}
                <span className="tabular ml-auto text-xs text-muted">
                  {standing.lines.toLocaleString()}
                  <span className="text-faint">
                    {" "}
                    · {formatShare(standing.share)}
                  </span>
                </span>
              </div>

              <div className="ml-7 mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(standing.lines / max) * 100}%`,
                    backgroundColor: standing.isViewer
                      ? "var(--color-accent)"
                      : "var(--color-series-1)",
                  }}
                />
              </div>
            </li>
          ))}
        </ol>

        {active.contenders === 1 && (
          <p className="mt-4 text-xs text-faint">
            Only one account has written {active.language} so far, so this is a
            standing of one.
          </p>
        )}
      </div>
    </div>
  );
}
