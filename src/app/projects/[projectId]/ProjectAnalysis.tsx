import type { ProjectAnalysisResult, RoleShare } from "@/lib/projectAnalysis";

/**
 * The per-project analysis panel.
 *
 * A server component, and a table twin for the composition bar, per the same
 * rule the charts follow: a value is never available only through colour.
 *
 * Roles get fixed colour slots from the categorical series scale, assigned in
 * the declared order — "colour follows the entity" means Front end is the same
 * colour on every project, which is only true if the slot comes from the role
 * and not from its rank in this particular project.
 */
const ROLE_COLOR: Record<RoleShare["role"], string> = {
  "Front end": "var(--color-series-1)",
  "Back end": "var(--color-series-2)",
  Systems: "var(--color-series-3)",
  Data: "var(--color-series-4)",
  Config: "var(--color-series-5)",
  Tooling: "var(--color-series-6)",
  Docs: "var(--color-series-7)",
  Unclassified: "var(--color-series-other)",
};

function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-tight">{value}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-faint">{note}</p>
    </div>
  );
}

function round(value: number, places = 1): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: places,
  });
}

export function ProjectAnalysis({
  analysis,
}: {
  analysis: ProjectAnalysisResult;
}) {
  const { roles, growth, concentration, size, dependencies } = analysis;

  return (
    <div className="space-y-6">
      {roles.length > 0 && (
        <div className="rounded-lg border border-line bg-surface px-4 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium">What the code is for</h3>
            <p className="text-xs text-muted">
              Share of lines by what each language does
            </p>
          </div>

          {/* Same mark spec as the language bar: a 2px surface gap separates
              segments, never a stroke drawn around each one. */}
          <div className="mt-3 flex h-4 w-full overflow-hidden rounded">
            {roles.map((role, index) => (
              <div
                key={role.role}
                style={{
                  width: `${role.share}%`,
                  backgroundColor: ROLE_COLOR[role.role],
                  marginLeft: index === 0 ? 0 : 2,
                }}
              />
            ))}
          </div>

          <table className="mt-3 w-full text-xs">
            <caption className="sr-only">
              Lines of code by language role
            </caption>
            <thead>
              <tr className="text-left text-faint">
                <th scope="col" className="pb-1 font-normal">
                  Role
                </th>
                <th scope="col" className="pb-1 text-right font-normal">
                  Lines
                </th>
                <th scope="col" className="pb-1 text-right font-normal">
                  Share
                </th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.role} className="border-t border-line">
                  <th scope="row" className="py-1 text-left font-normal">
                    <span className="flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: ROLE_COLOR[role.role] }}
                      />
                      {role.role}
                    </span>
                  </th>
                  <td className="tabular py-1 text-right text-muted">
                    {role.lines.toLocaleString()}
                  </td>
                  <td className="tabular py-1 text-right text-muted">
                    {role.share.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {roles.some((r) => r.role === "Unclassified") && (
            <p className="mt-2 text-xs leading-relaxed text-faint">
              Unclassified is the analyzer&rsquo;s own catch-all: files whose
              extension it does not recognise. A large share here usually means
              a language DevTrack cannot name yet.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {concentration && (
          <Metric
            label="Dominant language"
            value={`${concentration.topShare.toFixed(0)}%`}
            note={`${concentration.topLanguage}. ${concentration.languagesFor90} of ${concentration.totalLanguages} ${
              concentration.totalLanguages === 1 ? "language" : "languages"
            } make up 90% of the lines.`}
          />
        )}

        {size && (
          <Metric
            label="Lines per file"
            value={round(size.linesPerFile)}
            note={`Averaged across every counted file, at ${round(
              size.bytesPerLine,
            )} bytes a line.`}
          />
        )}

        {growth ? (
          <Metric
            label="Lines since first scan"
            value={`${growth.delta >= 0 ? "+" : ""}${growth.delta.toLocaleString()}`}
            note={
              growth.perDay === null
                ? `From ${growth.firstLines.toLocaleString()} to ${growth.latestLines.toLocaleString()}. Under a day of history, so no rate is shown.`
                : `From ${growth.firstLines.toLocaleString()} to ${growth.latestLines.toLocaleString()}, about ${round(
                    growth.perDay,
                  )} a day over ${round(growth.trackedDays)} days.`
            }
          />
        ) : (
          <Metric
            label="Lines since first scan"
            value="—"
            note="Needs a second snapshot. Re-scan the project to start tracking movement."
          />
        )}

        <Metric
          label="Dependencies"
          value={dependencies.total.toLocaleString()}
          note={
            dependencies.total === 0
              ? "No manifest declared any, or none was found."
              : `${dependencies.byScope
                  .map((s) => `${s.count} ${s.scope.toLowerCase()}`)
                  .join(", ")} · ${dependencies.managers.join(", ").toLowerCase()}`
          }
        />
      </div>
    </div>
  );
}
