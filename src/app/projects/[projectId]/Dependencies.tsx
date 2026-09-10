import type {
  DependencyScope,
  PackageManager,
} from "@/generated/prisma/enums";

export type DependencyRow = {
  id: string;
  name: string;
  version: string | null;
  manager: PackageManager;
  scope: DependencyScope;
  sourceFile: string;
};

const MANAGER_LABEL: Record<PackageManager, string> = {
  NPM: "npm",
  PIP: "pip",
  GO: "Go modules",
  CARGO: "Cargo",
  COMPOSER: "Composer",
  OTHER: "Other",
};

const SCOPE_LABEL: Record<DependencyScope, string> = {
  RUNTIME: "runtime",
  DEV: "dev",
  PEER: "peer",
  OPTIONAL: "optional",
};

const SCOPE_ORDER: DependencyScope[] = ["RUNTIME", "PEER", "OPTIONAL", "DEV"];

/**
 * Dependencies for one snapshot, grouped by package manager.
 *
 * A server component: there is nothing to interact with, so it ships no client
 * JavaScript. Runtime dependencies come first because they are what actually
 * ends up in the thing you run.
 */
export function Dependencies({ rows }: { rows: DependencyRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-surface px-4 py-8 text-center">
        <p className="text-sm font-medium">No dependencies found</p>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted">
          Nothing in the latest snapshot looked like a manifest. DevTrack reads
          package.json, requirements.txt, go.mod, Cargo.toml and composer.json.
        </p>
      </div>
    );
  }

  const managers = [...new Set(rows.map((row) => row.manager))].sort();

  return (
    <div className="space-y-5">
      {managers.map((manager) => {
        const forManager = rows
          .filter((row) => row.manager === manager)
          .sort(
            (a, b) =>
              SCOPE_ORDER.indexOf(a.scope) - SCOPE_ORDER.indexOf(b.scope) ||
              a.name.localeCompare(b.name),
          );

        return (
          <div key={manager}>
            <p className="text-xs text-faint">
              {MANAGER_LABEL[manager]}
              <span className="text-faint"> · </span>
              {forManager.length}
            </p>
            <table className="mt-1.5 w-full text-xs">
              <caption className="sr-only">
                {MANAGER_LABEL[manager]} dependencies
              </caption>
              <thead>
                <tr className="border-b border-line text-left text-faint">
                  <th scope="col" className="py-1.5 font-medium">
                    Package
                  </th>
                  <th scope="col" className="py-1.5 font-medium">
                    Version
                  </th>
                  <th scope="col" className="py-1.5 text-right font-medium">
                    Scope
                  </th>
                </tr>
              </thead>
              <tbody>
                {forManager.map((row) => (
                  <tr key={row.id} className="border-b border-line last:border-0">
                    {/* text-left is explicit: a th centres by default, which
                        reads as a broken column in a data table. */}
                    <th scope="row" className="py-1.5 text-left font-normal">
                      {row.name}
                    </th>
                    <td className="tabular py-1.5 font-mono text-muted">
                      {row.version ?? "—"}
                    </td>
                    <td className="py-1.5 text-right text-muted">
                      {SCOPE_LABEL[row.scope]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
