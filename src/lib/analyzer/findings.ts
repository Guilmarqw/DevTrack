import { loadAll as loadAllYaml } from "js-yaml";
import type { FindingSeverity } from "@/generated/prisma/enums";
import type { ManifestProblem } from "./dependencies";

/**
 * Findings: the things DevTrack can say are *wrong*, as opposed to measured.
 *
 * Two deliberately modest kinds, because the analyzer never keeps your code:
 *
 *   - **syntax** — a structured file that genuinely does not parse. The body is
 *     already in memory for other reasons, so this costs nothing extra.
 *   - **hygiene** — facts about which files exist. A `.env` that no ignore rule
 *     covers, a `package.json` with no lockfile, no tests, no README.
 *
 * What this is explicitly NOT: a linter or a type checker. Those need the whole
 * tree on disk plus its installed dependencies, and the editor that wrote the
 * code already runs them. Every rule here is one DevTrack can answer with
 * certainty from what it already holds — so a finding is never a guess, and
 * "no findings" is never false comfort about code quality.
 *
 * The bias throughout is against false positives. A wrong ERROR about a
 * committed secret costs the owner's trust in every other finding, so where a
 * rule cannot be sure it either drops to INFO or stays silent.
 */

export type Finding = {
  /** Stable slug, so a finding can be recognised across snapshots. */
  rule: string;
  severity: FindingSeverity;
  title: string;
  detail: string;
  /** The file it concerns, or null for a whole-project observation. */
  path: string | null;
};

/**
 * Budget for syntax checking.
 *
 * Structured bodies are validated in `add()` and dropped immediately, so these
 * caps bound how much work a hostile upload can cause, not how much memory is
 * held. A repo with 50,000 locale JSON files should not spend a minute parsing
 * them all to tell you the same thing.
 */
export const MAX_STRUCTURED_FILE_BYTES = 1024 * 1024;
export const MAX_STRUCTURED_FILES = 400;
export const MAX_STRUCTURED_TOTAL_BYTES = 8 * 1024 * 1024;

// --- which files can be checked at all -----------------------------------

export type StructuredKind = "json" | "jsonc" | "yaml" | "prisma";

/**
 * Files that are JSON by extension but JSONC by convention: comments and
 * trailing commas are legal and extremely common in them. Parsing these
 * strictly is the single largest false-positive source in the whole module —
 * a perfectly valid commented `tsconfig.json` is not a broken file.
 */
const JSONC_NAMES = new Set([
  "tsconfig.json",
  "jsconfig.json",
  "devcontainer.json",
  ".eslintrc.json",
  ".babelrc.json",
  ".swcrc",
  "nest-cli.json",
  "tslint.json",
]);

function basenameOf(path: string): string {
  return (path.split("/").pop() ?? path).toLowerCase();
}

export function structuredKind(path: string): StructuredKind | null {
  const name = basenameOf(path);

  if (name.endsWith(".jsonc") || name.endsWith(".json5")) return "jsonc";
  if (name.endsWith(".json")) {
    if (JSONC_NAMES.has(name)) return "jsonc";
    // tsconfig.build.json, tsconfig.node.json and friends are all JSONC.
    if (/^(tsconfig|jsconfig)\..*\.json$/.test(name)) return "jsonc";
    return "json";
  }
  if (name.endsWith(".yml") || name.endsWith(".yaml")) return "yaml";
  if (name.endsWith(".prisma")) return "prisma";
  if (JSONC_NAMES.has(name)) return "jsonc";

  return null;
}

// --- JSON ----------------------------------------------------------------

/**
 * Blanks out comments and trailing commas without changing the string's
 * length, so a byte offset in the result still points at the same character of
 * the original file. That is what lets a reported line number be the line the
 * owner will actually open.
 *
 * Written as a scanner rather than a regex because a regex cannot tell a `//`
 * inside a string ("https://…", a Windows path) from a real comment.
 */
export function relaxJsonc(source: string): string {
  const out = source.split("");
  let i = 0;
  let inString = false;

  while (i < out.length) {
    const char = out[i];

    if (inString) {
      if (char === "\\") {
        i += 2;
        continue;
      }
      if (char === '"') inString = false;
      i += 1;
      continue;
    }

    if (char === '"') {
      inString = true;
      i += 1;
      continue;
    }

    if (char === "/" && out[i + 1] === "/") {
      while (i < out.length && out[i] !== "\n") {
        out[i] = " ";
        i += 1;
      }
      continue;
    }

    if (char === "/" && out[i + 1] === "*") {
      // Newlines are preserved so line numbers after the comment stay right.
      while (i < out.length && !(out[i] === "*" && out[i + 1] === "/")) {
        if (out[i] !== "\n") out[i] = " ";
        i += 1;
      }
      if (i < out.length) {
        out[i] = " ";
        out[i + 1] = " ";
        i += 2;
      }
      continue;
    }

    i += 1;
  }

  // Trailing commas, now that comments can no longer hide one.
  let j = 0;
  let inStr = false;
  while (j < out.length) {
    const char = out[j];
    if (inStr) {
      if (char === "\\") {
        j += 2;
        continue;
      }
      if (char === '"') inStr = false;
      j += 1;
      continue;
    }
    if (char === '"') {
      inStr = true;
      j += 1;
      continue;
    }
    if (char === ",") {
      let k = j + 1;
      while (k < out.length && /\s/.test(out[k])) k += 1;
      if (out[k] === "}" || out[k] === "]") out[j] = " ";
    }
    j += 1;
  }

  return out.join("");
}

/** 1-based line number of a byte offset, for pointing at the failure. */
function lineOfOffset(source: string, offset: number): number {
  let line = 1;
  const limit = Math.min(offset, source.length);
  for (let i = 0; i < limit; i += 1) {
    if (source[i] === "\n") line += 1;
  }
  return line;
}

/**
 * Node's JSON errors come in two shapes — some carry
 * `at position N (line L column C)`, others end with a window of the document
 * quoted back. Both tails are noise once the line is reported separately.
 */
function cleanJsonMessage(message: string): string {
  return message
    .replace(/\s*in JSON at position \d+(\s*\(line \d+ column \d+\))?/, "")
    .replace(/,\s*(?:\.\.\.)?"[\s\S]*"\s*is not valid JSON$/, "")
    .replace(/\s*is not valid JSON$/, "")
    .trim();
}

/**
 * Where the parse actually failed.
 *
 * Only V8's `Expected … at position N` family states a position. The
 * `Unexpected token 'X', "…" is not valid JSON` family — which covers a great
 * many real mistakes, including every stray bracket — states none at all, and
 * a syntax finding without a line number is most of the way to useless.
 *
 * What that family does give is a window of the source ending at the offending
 * character, prefixed with `...` when it was truncated from the left. Locating
 * that window in the file recovers the offset exactly.
 */
function offsetOfFailure(message: string, source: string): number | null {
  const stated = /at position (\d+)/.exec(message);
  if (stated) return Number(stated[1]);

  const quoted =
    /^Unexpected token [\s\S]*?, (?:\.\.\.)?"([\s\S]*)" is not valid JSON$/.exec(
      message,
    );
  if (!quoted?.[1]) return null;

  const window = quoted[1];
  const at = source.lastIndexOf(window);
  if (at < 0) return null;
  return at + window.length - 1;
}

function jsonFinding(
  path: string,
  source: string,
  kind: "json" | "jsonc",
  error: unknown,
): Finding {
  const message = error instanceof Error ? error.message : String(error);
  const offset = offsetOfFailure(message, source);
  const line = offset === null ? null : lineOfOffset(source, offset);

  const where = line === null ? "" : ` on line ${line}`;
  const relaxed =
    kind === "jsonc"
      ? " Comments and trailing commas were allowed for this file, so this is a real syntax error."
      : "";

  return {
    rule: "json-invalid",
    severity: "ERROR",
    title: "JSON does not parse",
    detail: `${cleanJsonMessage(message)}${where}.${relaxed}`,
    path,
  };
}

// --- YAML ----------------------------------------------------------------

type YamlMark = { line?: number };

/**
 * A YAML file that is really a template — Helm, Ansible, Jinja, Liquid — is
 * not valid YAML until it has been rendered, and reporting it as broken would
 * be wrong. The marker check is cheap and the false-negative it costs (a
 * genuinely broken template) is much cheaper than the false positive.
 */
function looksTemplated(source: string): boolean {
  return source.includes("{{") || source.includes("{%");
}

function yamlFinding(path: string, source: string): Finding | null {
  if (looksTemplated(source)) return null;

  try {
    // loadAll, not load: a file with `---` separators holds several documents
    // and load() rejects it outright even when every document is valid.
    loadAllYaml(source);
    return null;
  } catch (error) {
    const reason =
      error && typeof error === "object" && "reason" in error
        ? String((error as { reason: unknown }).reason)
        : error instanceof Error
          ? error.message
          : String(error);

    // Custom tags (CloudFormation's !Ref, !GetAtt) are valid in their own
    // dialect and unknown to a plain schema. Not our error to report.
    if (/unknown tag/i.test(reason)) return null;

    const mark =
      error && typeof error === "object" && "mark" in error
        ? ((error as { mark: YamlMark }).mark ?? {})
        : {};
    const line = typeof mark.line === "number" ? mark.line + 1 : null;

    return {
      rule: "yaml-invalid",
      severity: "ERROR",
      title: "YAML does not parse",
      detail: `${reason}${line === null ? "" : ` on line ${line}`}.`,
      path,
    };
  }
}

// --- Prisma --------------------------------------------------------------

/**
 * Only brace balance, and the finding says exactly that.
 *
 * There is no Prisma parser to call, and a hand-rolled one would invent errors
 * in schemas that are actually fine. An unbalanced brace, though, is
 * unambiguous — and it is the failure a half-finished edit actually produces.
 */
function prismaFinding(path: string, source: string): Finding | null {
  let depth = 0;
  let line = 1;
  let openedAt = 0;
  let inString = false;
  let inComment = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];

    if (char === "\n") {
      line += 1;
      inComment = false;
      continue;
    }
    if (inComment) continue;
    if (inString) {
      if (char === "\\") {
        i += 1;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "/" && source[i + 1] === "/") {
      inComment = true;
      continue;
    }
    if (char === "{") {
      if (depth === 0) openedAt = line;
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth < 0) {
        return {
          rule: "prisma-unbalanced",
          severity: "ERROR",
          title: "Prisma schema has an unmatched brace",
          detail: `A closing brace on line ${line} has nothing to close.`,
          path,
        };
      }
    }
  }

  if (depth > 0) {
    return {
      rule: "prisma-unbalanced",
      severity: "ERROR",
      title: "Prisma schema has an unclosed block",
      detail: `The block opening on line ${openedAt} is never closed.`,
      path,
    };
  }

  return null;
}

// --- the syntax entry point ----------------------------------------------

/**
 * Validates one structured file. Returns null when it parses, or when the
 * file is one of the shapes this module deliberately declines to judge.
 */
export function validateStructured(
  path: string,
  content: Buffer,
): Finding | null {
  const kind = structuredKind(path);
  if (!kind) return null;

  // A UTF-8 BOM is legal in a file and illegal to JSON.parse.
  const source = content.toString("utf8").replace(/^﻿/, "");
  if (source.trim() === "") return null;

  if (kind === "yaml") return yamlFinding(path, source);
  if (kind === "prisma") return prismaFinding(path, source);

  const candidate = kind === "jsonc" ? relaxJsonc(source) : source;
  try {
    JSON.parse(candidate);
    return null;
  } catch (error) {
    // The candidate, not the original: the quoted window in V8's message comes
    // from the string it was handed. relaxJsonc preserves both length and
    // newlines, so a line number derived from it is the file's own line.
    return jsonFinding(path, candidate, kind, error);
  }
}

// --- hygiene -------------------------------------------------------------

/** Only the npm-family lockfiles, since the rule is about package.json. */
const NPM_LOCKFILES = new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "bun.lock",
]);

/** Directory names that mean "the files in here are tests". */
const TEST_DIRECTORIES = new Set([
  "test",
  "tests",
  "__tests__",
  "spec",
  "e2e",
  "cypress",
]);

/** `.env.example` exists to be committed. Flagging it would be noise. */
const ENV_TEMPLATE_SUFFIXES = [
  ".example",
  ".sample",
  ".template",
  ".dist",
  ".defaults",
  ".local.example",
];

function isEnvSecretFile(name: string): boolean {
  if (name !== ".env" && !name.startsWith(".env.")) return false;
  return !ENV_TEMPLATE_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

function looksLikeTest(path: string): boolean {
  const segments = path.split("/");
  for (const segment of segments.slice(0, -1)) {
    if (TEST_DIRECTORIES.has(segment.toLowerCase())) return true;
  }

  const name = basenameOf(path);
  return (
    /\.(test|spec)\.[a-z0-9]+$/.test(name) ||
    /^test[._-]/.test(name) ||
    /_test\.[a-z0-9]+$/.test(name) ||
    /_spec\.[a-z0-9]+$/.test(name)
  );
}

/**
 * Turns one .gitignore line into a matcher.
 *
 * Not a complete implementation of gitignore semantics — it covers the plain
 * name, glob and anchored-path forms that actually appear in the wild. Where
 * it is unsure it errs toward *matching*, because the harm here is asymmetric:
 * wrongly telling someone their secrets are exposed is far worse than staying
 * quiet about a file git was ignoring anyway.
 */
function patternMatches(pattern: string, path: string): boolean {
  let body = pattern.trim();
  if (!body || body.startsWith("#")) return false;

  const anchored = body.startsWith("/");
  if (anchored) body = body.slice(1);
  if (body.endsWith("/")) body = body.slice(0, -1);
  if (!body) return false;

  const regexSource = body
    .split("**")
    .map((part) =>
      part
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, "[^/]*")
        .replace(/\?/g, "[^/]"),
    )
    .join(".*");

  const regex = new RegExp(`^${regexSource}$`);

  if (regex.test(path)) return true;
  // An unanchored pattern with no slash applies at every depth.
  if (!anchored && !body.includes("/")) {
    return regex.test(basenameOf(path));
  }
  return false;
}

export function gitignoreCovers(gitignore: string, path: string): boolean {
  // Last matching pattern wins, which is how a `!` negation re-includes a file.
  let covered = false;
  for (const raw of gitignore.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    if (line.startsWith("!")) {
      if (patternMatches(line.slice(1), path)) covered = false;
      continue;
    }
    if (patternMatches(line, path)) covered = true;
  }
  return covered;
}

/**
 * Collects whole-project observations from paths alone.
 *
 * Two entry points, because the exclusion list cuts both ways:
 *
 *   - `observeRaw` sees **every** path, including excluded ones, and is what
 *     makes the lockfile rule work at all — lockfiles are on the exclusion
 *     list, so a collector fed only counted files would report "no lockfile"
 *     for every project that has one.
 *   - `observe` sees only counted paths, because the other rules must not read
 *     signals out of vendored code. `node_modules/x/test/a.js` is not evidence
 *     that this project has tests, and it is exactly the kind of accident that
 *     makes a whole findings panel untrustworthy.
 */
export class HygieneCollector {
  private hasPackageJson = false;
  private hasLockfile = false;
  private hasReadme = false;
  private hasTests = false;
  private gitignore: string | null = null;
  private readonly envFiles = new Set<string>();
  private structuredChecked = 0;
  private structuredSkipped = 0;

  /** Every path in the upload, excluded or not. Lockfiles only. */
  observeRaw(path: string): void {
    if (NPM_LOCKFILES.has(basenameOf(path))) this.hasLockfile = true;
  }

  /** Counted paths only — see the class comment. */
  observe(path: string): void {
    const name = basenameOf(path);

    if (name === "package.json") this.hasPackageJson = true;
    if (name.startsWith("readme")) this.hasReadme = true;
    if (!this.hasTests && looksLikeTest(path)) this.hasTests = true;
    if (isEnvSecretFile(name)) this.envFiles.add(path);
  }

  setGitignore(content: string): void {
    // A monorepo has several; concatenating them is right for a "does anything
    // ignore this" question, and wrong only for negations across files, which
    // would be a pathological way to write them.
    this.gitignore = this.gitignore === null ? content : `${this.gitignore}\n${content}`;
  }

  countStructured(checked: boolean): void {
    if (checked) this.structuredChecked += 1;
    else this.structuredSkipped += 1;
  }

  finish(): Finding[] {
    const findings: Finding[] = [];

    for (const path of this.envFiles) {
      if (this.gitignore === null) {
        findings.push({
          rule: "env-no-gitignore",
          severity: "WARN",
          title: "Environment file with no .gitignore in the upload",
          detail:
            "This file usually holds credentials, and the upload contains no .gitignore that could be keeping it out of version control. Worth checking that it is not committed.",
          path,
        });
        continue;
      }

      if (!gitignoreCovers(this.gitignore, path)) {
        findings.push({
          rule: "env-not-ignored",
          severity: "ERROR",
          title: "Environment file is not covered by .gitignore",
          detail:
            "This file usually holds credentials, and no ignore rule matches it — so it is very likely committed. Add it to .gitignore and rotate anything it contains that has already been pushed.",
          path,
        });
      }
    }

    if (this.hasPackageJson && !this.hasLockfile) {
      findings.push({
        rule: "lockfile-missing",
        severity: "WARN",
        title: "package.json with no lockfile",
        detail:
          "Without a lockfile an install resolves whatever versions are current that day, so two machines can get different dependency trees from the same commit. Commit the lockfile your package manager writes.",
        path: null,
      });
    }

    if (!this.hasTests) {
      findings.push({
        rule: "tests-absent",
        severity: "INFO",
        title: "No test files found",
        detail:
          "Nothing matched the usual test conventions — a test/, tests/ or __tests__/ directory, or a name like *.test.*, *.spec.*, *_test.* or test_*. Tests under a different convention will not have been recognised.",
        path: null,
      });
    }

    if (!this.hasReadme) {
      findings.push({
        rule: "readme-absent",
        severity: "INFO",
        title: "No README",
        detail:
          "Nothing in the upload starts with 'readme'. A short one is the cheapest way to make a project legible to you in six months.",
        path: null,
      });
    }

    if (this.structuredSkipped > 0) {
      findings.push({
        rule: "syntax-check-truncated",
        severity: "INFO",
        title: "Syntax checking stopped early",
        detail: `${this.structuredChecked.toLocaleString()} structured files were checked and ${this.structuredSkipped.toLocaleString()} were not, because this project holds more JSON, YAML and schema files than one scan will parse. The files that were checked are still reported normally.`,
        path: null,
      });
    }

    return findings;
  }
}

// --- manifest problems ---------------------------------------------------

/**
 * Promotes the dependency reader's own parse failures to findings, so they
 * outlive the upload panel they used to be shown in and only in.
 *
 * A manifest that fails to parse usually also fails the syntax check, and one
 * broken file should not produce two rows — the syntax finding is the more
 * precise of the two, so it wins.
 */
export function manifestProblemFindings(
  problems: ManifestProblem[],
  alreadyReported: Set<string>,
): Finding[] {
  return problems
    .filter((problem) => !alreadyReported.has(problem.path))
    .map((problem) => ({
      rule: "manifest-unreadable",
      severity: "ERROR" as FindingSeverity,
      title: "Dependency manifest could not be read",
      detail: `This file is ${problem.reason}, so none of the dependencies it declares are included in this snapshot.`,
      path: problem.path,
    }));
}

/** Highest severity first, then by rule, so the panel has a stable order. */
const SEVERITY_ORDER: Record<FindingSeverity, number> = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
};

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.rule.localeCompare(b.rule) ||
      (a.path ?? "").localeCompare(b.path ?? ""),
  );
}
