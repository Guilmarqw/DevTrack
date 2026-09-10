import { isExcludedPath } from "./exclude";
import type { RawEntry } from "./analyze";
import type {
  DependencyScope,
  PackageManager,
} from "@/generated/prisma/enums";

export type ParsedDependency = {
  name: string;
  /** The declared range, verbatim ("^19.2.0"), never a resolved version. */
  version: string | null;
  manager: PackageManager;
  scope: DependencyScope;
  sourceFile: string;
};

/** A manifest that could not be parsed, surfaced rather than swallowed. */
export type ManifestProblem = { path: string; reason: string };

export type DependencyScan = {
  dependencies: ParsedDependency[];
  manifests: string[];
  problems: ManifestProblem[];
};

export const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;

/**
 * Whether a path is a dependency manifest.
 *
 * Exported because the streaming reader has to decide *before* reading a file
 * whether its contents are worth keeping — manifests are the only files whose
 * bodies survive past the line counter.
 */
export function isManifestPath(path: string): boolean {
  const name = basenameOf(path);
  return (
    name === "package.json" ||
    name === "composer.json" ||
    name === "go.mod" ||
    name === "cargo.toml" ||
    /^[a-z-]*requirements[a-z-]*[.]txt$/.test(name)
  );
}

function text(entry: RawEntry): string {
  return entry.content.toString("utf8");
}

// --- package.json --------------------------------------------------------

const NPM_SCOPES: Array<[string, DependencyScope]> = [
  ["dependencies", "RUNTIME"],
  ["devDependencies", "DEV"],
  ["peerDependencies", "PEER"],
  ["optionalDependencies", "OPTIONAL"],
];

function parsePackageJson(
  entry: RawEntry,
  problems: ManifestProblem[],
): ParsedDependency[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text(entry));
  } catch {
    problems.push({ path: entry.path, reason: "not valid JSON" });
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];

  const root = parsed as Record<string, unknown>;
  const out: ParsedDependency[] = [];

  for (const [key, scope] of NPM_SCOPES) {
    const block = root[key];
    if (!block || typeof block !== "object") continue;
    for (const [name, range] of Object.entries(block as Record<string, unknown>)) {
      if (!name) continue;
      out.push({
        name,
        version: typeof range === "string" && range ? range : null,
        manager: "NPM",
        scope,
        sourceFile: entry.path,
      });
    }
  }
  return out;
}

// --- requirements.txt ----------------------------------------------------

/** `pkg[extra]>=1.2 ; python_version < "3.11"  # comment` -> name + specifier */
function parseRequirementLine(line: string): { name: string; version: string | null } | null {
  let cleaned = line.split("#")[0].split(";")[0].trim();
  if (!cleaned) return null;
  // Skip pip directives (-r other.txt, -e ., --index-url ...) and URLs.
  if (cleaned.startsWith("-") || /^[a-z+]+:\/\//i.test(cleaned)) return null;

  // Editable/VCS installs carry no clean name.
  if (cleaned.includes("@") && !cleaned.startsWith("@")) {
    cleaned = cleaned.split("@")[0].trim();
    if (!cleaned) return null;
  }

  const match = /^([A-Za-z0-9._-]+)\s*(\[[^\]]*\])?\s*(.*)$/.exec(cleaned);
  if (!match) return null;

  const name = match[1];
  const specifier = match[3].trim();
  return { name, version: specifier || null };
}

function parseRequirements(entry: RawEntry): ParsedDependency[] {
  // requirements-dev.txt / dev-requirements.txt are development pins.
  const lower = entry.path.toLowerCase();
  const scope: DependencyScope = /dev|test/.test(lower) ? "DEV" : "RUNTIME";

  const out: ParsedDependency[] = [];
  for (const line of text(entry).split(/\r?\n/)) {
    const parsed = parseRequirementLine(line);
    if (!parsed) continue;
    out.push({
      ...parsed,
      manager: "PIP",
      scope,
      sourceFile: entry.path,
    });
  }
  return out;
}

// --- go.mod --------------------------------------------------------------

function parseGoMod(entry: RawEntry): ParsedDependency[] {
  const out: ParsedDependency[] = [];
  let inBlock = false;

  for (const raw of text(entry).split(/\r?\n/)) {
    const line = raw.split("//")[0].trim();
    const isIndirect = raw.includes("// indirect");

    if (line === "require (") {
      inBlock = true;
      continue;
    }
    if (inBlock && line === ")") {
      inBlock = false;
      continue;
    }

    // Transitive requirements are not this project's declared dependencies.
    if (isIndirect) continue;

    const body = inBlock ? line : /^require\s+(.+)$/.exec(line)?.[1] ?? "";
    if (!body) continue;

    const parts = body.split(/\s+/).filter(Boolean);
    if (parts.length < 2 || !parts[0].includes("/")) continue;

    out.push({
      name: parts[0],
      version: parts[1],
      manager: "GO",
      scope: "RUNTIME",
      sourceFile: entry.path,
    });
  }
  return out;
}

// --- Cargo.toml ----------------------------------------------------------

const CARGO_SECTIONS: Record<string, DependencyScope> = {
  dependencies: "RUNTIME",
  "dev-dependencies": "DEV",
  "build-dependencies": "DEV",
};

function parseCargoToml(entry: RawEntry): ParsedDependency[] {
  const out: ParsedDependency[] = [];
  let scope: DependencyScope | null = null;

  for (const raw of text(entry).split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    if (!line) continue;

    const section = /^\[([^\]]+)\]$/.exec(line);
    if (section) {
      // Handles [dependencies] and [target.'cfg(...)'.dependencies].
      const tail = section[1].split(".").pop() ?? "";
      scope = CARGO_SECTIONS[tail] ?? null;
      continue;
    }
    if (!scope) continue;

    const pair = /^([A-Za-z0-9._-]+)\s*=\s*(.+)$/.exec(line);
    if (!pair) continue;

    const name = pair[1];
    const value = pair[2].trim();

    // Either `serde = "1.0"` or `serde = { version = "1.0", features = [...] }`
    const simple = /^"([^"]*)"$/.exec(value);
    const inline = /version\s*=\s*"([^"]*)"/.exec(value);
    const version = simple?.[1] ?? inline?.[1] ?? null;

    out.push({ name, version, manager: "CARGO", scope, sourceFile: entry.path });
  }
  return out;
}

// --- composer.json -------------------------------------------------------

function parseComposerJson(
  entry: RawEntry,
  problems: ManifestProblem[],
): ParsedDependency[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text(entry));
  } catch {
    problems.push({ path: entry.path, reason: "not valid JSON" });
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];

  const root = parsed as Record<string, unknown>;
  const out: ParsedDependency[] = [];

  for (const [key, scope] of [
    ["require", "RUNTIME"],
    ["require-dev", "DEV"],
  ] as Array<[string, DependencyScope]>) {
    const block = root[key];
    if (!block || typeof block !== "object") continue;
    for (const [name, range] of Object.entries(block as Record<string, unknown>)) {
      if (!name) continue;
      out.push({
        name,
        version: typeof range === "string" && range ? range : null,
        manager: "COMPOSER",
        scope,
        sourceFile: entry.path,
      });
    }
  }
  return out;
}

// --- dispatch ------------------------------------------------------------

function basenameOf(path: string): string {
  return (path.split("/").pop() ?? path).toLowerCase();
}

/**
 * Reads every dependency manifest in the tree.
 *
 * Runs the same exclusion rules as the line counter first, which is what stops
 * a vendored `node_modules/**\/package.json` from contributing thousands of
 * dependencies that are not this project's.
 *
 * A monorepo legitimately has several manifests, so all of them are read and
 * the results deduplicated on (manager, name, scope) — matching the database's
 * own unique constraint. The first occurrence wins and keeps its sourceFile.
 */
export function scanDependencies(entries: RawEntry[]): DependencyScan {
  const problems: ManifestProblem[] = [];
  const manifests: string[] = [];
  const collected: ParsedDependency[] = [];

  for (const entry of entries) {
    if (isExcludedPath(entry.path)) continue;
    if (entry.content.length > MAX_MANIFEST_BYTES) continue;

    const name = basenameOf(entry.path);
    let found: ParsedDependency[] | null = null;

    if (name === "package.json") found = parsePackageJson(entry, problems);
    else if (name === "composer.json") found = parseComposerJson(entry, problems);
    else if (name === "go.mod") found = parseGoMod(entry);
    else if (name === "cargo.toml") found = parseCargoToml(entry);
    else if (/^[a-z-]*requirements[a-z-]*\.txt$/.test(name)) {
      found = parseRequirements(entry);
    }

    if (found) {
      manifests.push(entry.path);
      collected.push(...found);
    }
  }

  const seen = new Set<string>();
  const dependencies = collected.filter((dep) => {
    const key = `${dep.manager}|${dep.name}|${dep.scope}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { dependencies, manifests, problems };
}
