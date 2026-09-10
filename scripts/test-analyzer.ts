import { folderNameFrom, isUnsafeEntryPath } from "../src/lib/upload/stream";
import {
  FileScanner,
  SnapshotAccumulator,
  stripSharedRoot,
} from "../src/lib/analyzer/stream";
import { isExcludedPath, normalizePath, looksBinary } from "../src/lib/analyzer/exclude";
import { computeCompletion } from "../src/lib/completion";
import { scanDependencies } from "../src/lib/analyzer/dependencies";
import { detectTech } from "../src/lib/analyzer/tech";
import {
  gitignoreCovers,
  HygieneCollector,
  relaxJsonc,
  validateStructured,
} from "../src/lib/analyzer/findings";
import { projectHealth } from "../src/lib/health";
import { analyseProject } from "../src/lib/projectAnalysis";
import { cursorIndex } from "../src/lib/uploadCursor";
import {
  analyze,
  countLines,
  detectLanguage,
  languageFromShebang,
  languagePercentages,
} from "../src/lib/analyzer/analyze";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok    ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}\n          expected ${e}\n          actual   ${a}`);
  }
}

const buf = (s: string) => Buffer.from(s, "utf8");

console.log("\ncountLines");
check("empty file", countLines(buf("")), 0);
check("one line, no trailing newline", countLines(buf("a")), 1);
check("one line, trailing newline", countLines(buf("a\n")), 1);
check("two lines LF", countLines(buf("a\nb")), 2);
check("CRLF counts once per line", countLines(buf("a\r\nb\r\n")), 2);
check("CRLF no trailing", countLines(buf("a\r\nb")), 2);
check("blank lines count", countLines(buf("a\n\n\nb\n")), 4);
check("lone CR is not a line break", countLines(buf("a\rb")), 1);

console.log("\nshebang");
check("env python3", languageFromShebang(buf("#!/usr/bin/env python3\n")), "Python");
check("bin bash", languageFromShebang(buf("#!/bin/bash\n")), "Shell");
check("env node", languageFromShebang(buf("#!/usr/bin/env node\n")), "JavaScript");
check("env -S ruby", languageFromShebang(buf("#!/usr/bin/env -S ruby -w\n")), "Ruby");
check("env VAR=1 python", languageFromShebang(buf("#!/usr/bin/env VAR=1 python\n")), "Python");
check("not a shebang", languageFromShebang(buf("# comment\n")), null);
check("unknown interpreter", languageFromShebang(buf("#!/bin/weirdlang\n")), null);

console.log("\ndetectLanguage");
check("by extension", detectLanguage("src/app/page.tsx", buf("x")), "TypeScript");
check("extensionless + shebang", detectLanguage("scripts/deploy", buf("#!/bin/bash\necho hi")), "Shell");
check("Dockerfile by name", detectLanguage("Dockerfile", buf("FROM node")), "Dockerfile");
check("Dockerfile.dev leading segment", detectLanguage("Dockerfile.dev", buf("FROM node")), "Dockerfile");
check("dotfile whole-name", detectLanguage(".gitignore", buf("node_modules")), "Ignore List");
check("unknown extension", detectLanguage("notes.xyzzy", buf("hello")), "Other");
check("extension beats shebang", detectLanguage("run.py", buf("#!/bin/bash\n")), "Python");

console.log("\nanalyze");
const result = analyze([
  { path: "src/index.ts", content: buf("const a = 1;\nconst b = 2;\n") },
  { path: "src/util.js", content: buf("module.exports = {};\n") },
  { path: "README.md", content: buf("# Title\n\nText\n") },
  { path: "scripts/build", content: buf("#!/usr/bin/env bash\nset -e\n") },
  // must all be excluded
  { path: "node_modules/left-pad/index.js", content: buf("module.exports = 1;\n") },
  { path: "packages/web/node_modules/dep/x.js", content: buf("var x = 1;\n") },
  { path: ".git/HEAD", content: buf("ref: refs/heads/main\n") },
  { path: "dist/bundle.js", content: buf("var y=1;\n") },
  { path: "public/vendor.min.js", content: buf("!function(){}();\n") },
  { path: "package-lock.json", content: buf('{"lockfileVersion":3}\n') },
  { path: "assets/logo.png", content: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]) },
  // binary without a telltale extension
  { path: "data/blob.custom", content: Buffer.from([0x01, 0x00, 0x02, 0x03]) },
  { path: "empty.ts", content: buf("") },
  // duplicate path, keep first
  { path: "src/index.ts", content: buf("this should be ignored\n") },
  // windows separators and ./ prefix normalise
  { path: ".\\src\\win.ts", content: buf("export {};\n") },
]);

check("counted files", result.totalFiles, 5);
check("total lines", result.totalLines, 2 + 1 + 3 + 2 + 1);
check(
  "languages present",
  result.languages.map((l) => l.language).sort(),
  ["JavaScript", "Markdown", "Shell", "TypeScript"],
);
check("typescript file count", result.languages.find((l) => l.language === "TypeScript")?.fileCount, 2);
check("excluded count", result.skipped.excluded, 7);
check("binary count", result.skipped.binary, 1);
check("empty count", result.skipped.empty, 1);
check("windows path normalised", result.files.some((f) => f.path === "src/win.ts"), true);
check("no backslashes survive", result.files.every((f) => !f.path.includes("\\")), true);
check("pathHash is sha256 hex", /^[0-9a-f]{64}$/.test(result.files[0].pathHash), true);

const pct = languagePercentages(result.languages);
const sum = pct.reduce((s, p) => s + p.percent, 0);
check("percentages sum to 100", Math.abs(sum - 100) < 0.0001, true);
check("empty input percentages", languagePercentages([]), []);

const emptyResult = analyze([]);
check("empty analysis totals", [emptyResult.totalFiles, emptyResult.totalLines, emptyResult.totalBytes], [0, 0, 0]);


console.log("\nnormalizePath");
check("backslashes", normalizePath("src\\app\\page.tsx"), "src/app/page.tsx");
check("leading ./", normalizePath("./src/a.ts"), "src/a.ts");
check("leading slash", normalizePath("/src/a.ts"), "src/a.ts");
check("whitespace", normalizePath("  src/a.ts  "), "src/a.ts");

console.log("\nisExcludedPath");
check("top-level node_modules", isExcludedPath("node_modules/a/index.js"), true);
check("nested node_modules", isExcludedPath("packages/web/node_modules/a/x.js"), true);
check("node_modules as filename is kept", isExcludedPath("docs/node_modules"), false);
check("dist dir", isExcludedPath("dist/bundle.js"), true);
check("min.js", isExcludedPath("public/a.min.js"), true);
check("source map", isExcludedPath("public/a.js.map"), true);
check("lockfile any case", isExcludedPath("Package-Lock.json"), true);
check("png", isExcludedPath("assets/logo.png"), true);
check("ordinary source", isExcludedPath("src/app/page.tsx"), false);
check("file named dist is kept", isExcludedPath("dist"), false);

console.log("\nlooksBinary");
check("text", looksBinary(buf("hello\nworld")), false);
check("NUL byte", looksBinary(Buffer.from([0x68, 0x00, 0x69])), true);
check("empty", looksBinary(Buffer.alloc(0)), false);

console.log("\nisUnsafeEntryPath");
check("parent traversal", isUnsafeEntryPath("../../evil.ts"), true);
check("traversal in middle", isUnsafeEntryPath("app/../../evil.ts"), true);
check("absolute unix", isUnsafeEntryPath("/etc/passwd"), true);
check("windows drive", isUnsafeEntryPath("C:/Windows/evil.dll"), true);
check("dotdot inside a name is fine", isUnsafeEntryPath("app/a..b.ts"), false);
check("ordinary path", isUnsafeEntryPath("app/src/index.ts"), false);

console.log("");
console.log("stripSharedRoot");
const scanned = (path: string) => ({
  path,
  pathHash: "x".repeat(64),
  language: "TypeScript",
  lines: 1,
  bytes: 1,
});
check(
  "shared root removed",
  stripSharedRoot([scanned("proj/a.ts"), scanned("proj/b/c.ts")]).map(
    (f) => f.path,
  ),
  ["a.ts", "b/c.ts"],
);
check(
  "no shared root kept as-is",
  stripSharedRoot([scanned("a.ts"), scanned("proj/b.ts")]).map((f) => f.path),
  ["a.ts", "proj/b.ts"],
);
check(
  "single bare file kept",
  stripSharedRoot([scanned("a.ts")]).map((f) => f.path),
  ["a.ts"],
);
check("empty list", stripSharedRoot([]), []);
check(
  "pathHash recomputed after stripping",
  stripSharedRoot([scanned("proj/a.ts"), scanned("proj/b.ts")])[0].pathHash !==
    "x".repeat(64),
  true,
);

console.log("\ncomputeCompletion");
const tasks = (...spec: Array<["TODO" | "IN_PROGRESS" | "DONE", number]>) =>
  spec.map(([status, weight]) => ({ status, weight }));
check("no tasks is 0 not 100", computeCompletion({ completionMode: "TASKS", manualCompletionPct: 0 }, []), 0);
check("half done", computeCompletion({ completionMode: "TASKS", manualCompletionPct: 0 }, tasks(["DONE", 1], ["TODO", 1])), 50);
check("weighted", computeCompletion({ completionMode: "TASKS", manualCompletionPct: 0 }, tasks(["DONE", 5], ["TODO", 1], ["TODO", 1], ["TODO", 1], ["TODO", 1], ["TODO", 1])), 50);
check("in-progress counts as not done", computeCompletion({ completionMode: "TASKS", manualCompletionPct: 0 }, tasks(["IN_PROGRESS", 1], ["TODO", 1])), 0);
check("manual mode ignores tasks", computeCompletion({ completionMode: "MANUAL", manualCompletionPct: 73 }, tasks(["DONE", 1])), 73);
check("manual clamps above 100", computeCompletion({ completionMode: "MANUAL", manualCompletionPct: 150 }, []), 100);
check("manual clamps below 0", computeCompletion({ completionMode: "MANUAL", manualCompletionPct: -5 }, []), 0);
check("zero weight treated as 1", computeCompletion({ completionMode: "TASKS", manualCompletionPct: 0 }, tasks(["DONE", 0], ["TODO", 0])), 50);


console.log("\nscanDependencies — package.json");
const npmScan = scanDependencies([
  {
    path: "package.json",
    content: buf(
      JSON.stringify({
        dependencies: { react: "^19.0.0", next: "16.3.4" },
        devDependencies: { typescript: "^5", eslint: "^9" },
        peerDependencies: { "react-dom": "^19.0.0" },
        optionalDependencies: { fsevents: "^2" },
      }),
    ),
  },
  // must not contribute: vendored manifests
  { path: "node_modules/left-pad/package.json", content: buf('{"dependencies":{"sneaky":"1.0.0"}}') },
  { path: "packages/api/node_modules/x/package.json", content: buf('{"dependencies":{"nested":"1.0.0"}}') },
]);
check("npm dependency count", npmScan.dependencies.length, 6);
check(
  "vendored manifests ignored",
  npmScan.dependencies.some((d) => d.name === "sneaky" || d.name === "nested"),
  false,
);
check("only the real manifest read", npmScan.manifests, ["package.json"]);
check(
  "dev scope mapped",
  npmScan.dependencies.filter((d) => d.scope === "DEV").map((d) => d.name).sort(),
  ["eslint", "typescript"],
);
check("peer scope", npmScan.dependencies.find((d) => d.name === "react-dom")?.scope, "PEER");
check("optional scope", npmScan.dependencies.find((d) => d.name === "fsevents")?.scope, "OPTIONAL");
check("range kept verbatim", npmScan.dependencies.find((d) => d.name === "react")?.version, "^19.0.0");

console.log("\nscanDependencies — malformed manifest");
const badScan = scanDependencies([
  { path: "package.json", content: buf("{ this is not json") },
  { path: "src/a.ts", content: buf("export {};\n") },
]);
check("no dependencies from broken json", badScan.dependencies.length, 0);
check("problem surfaced not swallowed", badScan.problems, [
  { path: "package.json", reason: "not valid JSON" },
]);

console.log("\nscanDependencies — requirements.txt");
const pipScan = scanDependencies([
  {
    path: "requirements.txt",
    content: buf(
      [
        "# comment line",
        "",
        "Django==5.0.1",
        "flask>=2.0,<3.0",
        "requests[security]==2.31.0",
        "psycopg2-binary",
        'uvicorn==0.30.0 ; python_version < "3.13"',
        "-r other-requirements.txt",
        "--index-url https://example.com/simple",
        "git+https://github.com/x/y.git",
      ].join("\n"),
    ),
  },
  { path: "requirements-dev.txt", content: buf("pytest==8.0.0\n") },
]);
check(
  "pip names",
  pipScan.dependencies.map((d) => d.name).sort(),
  ["Django", "flask", "psycopg2-binary", "pytest", "requests", "uvicorn"],
);
check("pip pin kept", pipScan.dependencies.find((d) => d.name === "Django")?.version, "==5.0.1");
check("pip compound range", pipScan.dependencies.find((d) => d.name === "flask")?.version, ">=2.0,<3.0");
check("extras stripped from name", pipScan.dependencies.find((d) => d.name === "requests")?.version, "==2.31.0");
check("bare name has no version", pipScan.dependencies.find((d) => d.name === "psycopg2-binary")?.version, null);
check("environment marker dropped", pipScan.dependencies.find((d) => d.name === "uvicorn")?.version, "==0.30.0");
check("dev requirements are DEV scope", pipScan.dependencies.find((d) => d.name === "pytest")?.scope, "DEV");

console.log("\nscanDependencies — go.mod");
const goScan = scanDependencies([
  {
    path: "go.mod",
    content: buf(
      [
        "module example.com/app",
        "go 1.23",
        "",
        "require (",
        "\tgithub.com/gin-gonic/gin v1.10.0",
        "\tgorm.io/gorm v1.25.0",
        "\tgithub.com/bytedance/sonic v1.11.6 // indirect",
        ")",
        "",
        "require github.com/stretchr/testify v1.9.0",
      ].join("\n"),
    ),
  },
]);
check(
  "go direct requires only",
  goScan.dependencies.map((d) => d.name).sort(),
  ["github.com/gin-gonic/gin", "github.com/stretchr/testify", "gorm.io/gorm"],
);
check("go version captured", goScan.dependencies.find((d) => d.name === "gorm.io/gorm")?.version, "v1.25.0");
check(
  "module line is not a dependency",
  goScan.dependencies.some((d) => d.name === "example.com/app"),
  false,
);

console.log("\nscanDependencies — Cargo.toml");
const cargoScan = scanDependencies([
  {
    path: "Cargo.toml",
    content: buf(
      [
        "[package]",
        'name = "app"',
        'version = "0.1.0"',
        "",
        "[dependencies]",
        'serde = "1.0"',
        'tokio = { version = "1.38", features = ["full"] }',
        "",
        "[dev-dependencies]",
        'criterion = "0.5"',
      ].join("\n"),
    ),
  },
]);
check(
  "cargo names",
  cargoScan.dependencies.map((d) => d.name).sort(),
  ["criterion", "serde", "tokio"],
);
check("cargo simple version", cargoScan.dependencies.find((d) => d.name === "serde")?.version, "1.0");
check("cargo inline table version", cargoScan.dependencies.find((d) => d.name === "tokio")?.version, "1.38");
check("cargo dev scope", cargoScan.dependencies.find((d) => d.name === "criterion")?.scope, "DEV");
check(
  "[package] keys are not dependencies",
  cargoScan.dependencies.some((d) => d.name === "version" || d.name === "name"),
  false,
);

console.log("\nscanDependencies — monorepo dedupe");
const monoScan = scanDependencies([
  { path: "package.json", content: buf('{"dependencies":{"react":"^19.0.0"}}') },
  { path: "packages/web/package.json", content: buf('{"dependencies":{"react":"^18.0.0","vue":"^3"}}') },
]);
check("duplicate name+scope collapses", monoScan.dependencies.filter((d) => d.name === "react").length, 1);
check("first occurrence wins", monoScan.dependencies.find((d) => d.name === "react")?.version, "^19.0.0");
check("both manifests recorded", monoScan.manifests.length, 2);
check("distinct package still present", monoScan.dependencies.some((d) => d.name === "vue"), true);

console.log("\ndetectTech");
const techEntries = [
  { path: "package.json", content: buf("{}") },
  { path: "next.config.ts", content: buf("export default {};\n") },
  { path: "tsconfig.json", content: buf('{"compilerOptions":{}}') },
  { path: "Dockerfile", content: buf("FROM node:24\n") },
  { path: ".github/workflows/ci.yml", content: buf("on: push\n") },
  { path: "prisma/schema.prisma", content: buf('datasource db {\n  provider = "mysql"\n}\n') },
  // excluded, must not contribute
  { path: "node_modules/react/package.json", content: buf("{}") },
];
const dep = (name: string, scope: "RUNTIME" | "DEV" = "RUNTIME") => ({
  name,
  version: "1",
  manager: "NPM" as const,
  scope,
  sourceFile: "package.json",
});
const tech = detectTech(techEntries, [
  dep("react"),
  dep("express"),
  dep("@prisma/client"),
  dep("eslint-plugin-react", "DEV"),
  dep("next-auth"),
]);
const named = (c: string) => tech.filter((t) => t.category === c).map((t) => t.name).sort();
check("frontend detected", named("FRONTEND"), ["Next.js", "React"]);
check("backend detected", named("BACKEND"), ["Express"]);
check("database detected", named("DATABASE"), ["MySQL", "Prisma"]);
check("other detected", named("OTHER"), ["Auth.js", "Docker", "GitHub Actions", "TypeScript"]);
check(
  "eslint-plugin-react is not React evidence",
  tech.find((t) => t.name === "React")?.evidence,
  "package.json: react",
);
check("next-auth maps to Auth.js not Next.js", tech.find((t) => t.name === "Auth.js")?.evidence, "package.json: next-auth");
check(
  "prisma datasource provider read",
  tech.find((t) => t.name === "MySQL")?.evidence,
  'schema.prisma provider "mysql"',
);
check("frontend sorts first", tech[0].category, "FRONTEND");
check(
  "no duplicate tech entries",
  tech.length,
  new Set(tech.map((t) => `${t.category}:${t.name}`)).size,
);
check("empty input", detectTech([], []), []);

console.log("\ncloud and hosting detection");
const cloudOf = (
  files: Array<[string, string]>,
  deps: string[] = [],
): string[] =>
  detectTech(
    files.map(([path, content]) => ({ path, content: buf(content) })),
    deps.map((name) => dep(name)),
  )
    .filter((t) => t.category === "CLOUD")
    .map((t) => t.name)
    .sort();

check(
  "Supabase from its client library",
  cloudOf([], ["@supabase/supabase-js"]),
  ["Supabase"],
);
check("Firebase from firebase.json alone", cloudOf([["firebase.json", "{}"]]), [
  "Firebase",
]);
check("Vercel from vercel.json alone", cloudOf([["vercel.json", "{}"]]), [
  "Vercel",
]);
check("AWS from boto3 in a Python project", cloudOf([], ["boto3"]), ["AWS"]);
check(
  "a supabase/ directory counts",
  cloudOf([["supabase/config.toml", "x = 1\n"]]),
  ["Supabase"],
);
check(
  "Terraform is cloud, not build tooling",
  cloudOf([["infra/main.tf", 'provider "aws" {}\n']]),
  ["Terraform"],
);
// The exact-match rule matters most here: cloud package names are long and
// heavily prefixed, so a substring rule would tag half of npm as AWS.
check(
  "a lookalike package name is not a cloud service",
  cloudOf([], ["supabase-helpers", "aws-sdk-mock", "firebase-tools-extra"]),
  [],
);
check(
  "one project can legitimately use several",
  cloudOf([["vercel.json", "{}"]], ["@supabase/supabase-js", "stripe"]),
  ["Stripe", "Supabase", "Vercel"],
);
check(
  "a cloud config inside node_modules does not count",
  cloudOf([["node_modules/x/firebase.json", "{}"]]),
  [],
);

console.log("");
console.log("FileScanner agrees with countLines");

// Feeds content through the scanner in awkward chunk sizes, because the whole
// risk of incremental counting is a boundary landing between bytes.
function scanInChunks(content: Buffer, size: number, path = "a.ts") {
  const scanner = new FileScanner();
  for (let i = 0; i < content.length; i += size) {
    scanner.update(content.subarray(i, i + size));
  }
  return scanner.finish(path);
}

const samples: Array<[string, string]> = [
  ["one line no newline", "a"],
  ["one line trailing newline", "a\n"],
  ["two lines", "a\nb"],
  ["CRLF", "a\r\nb\r\n"],
  ["CRLF no trailing", "a\r\nb"],
  ["blank lines", "a\n\n\nb\n"],
  ["lone CR", "a\rb"],
  ["long file", Array.from({ length: 500 }, (_, i) => `line ${i}`).join("\n")],
];

for (const [label, text] of samples) {
  const content = buf(text);
  const expected = countLines(content);
  // Chunk size 1 is the worst case: every newline lands on a boundary.
  for (const size of [1, 3, 7, 4096]) {
    const outcome = scanInChunks(content, size);
    const lines = "file" in outcome ? outcome.file.lines : -1;
    check(`${label} @ ${size}b chunks`, lines, expected);
  }
}

console.log("");
console.log("FileScanner classification");
check(
  "binary detected across a chunk boundary",
  (() => {
    const outcome = scanInChunks(Buffer.from([0x61, 0x00, 0x62]), 1);
    return "skipped" in outcome ? outcome.skipped : "not skipped";
  })(),
  "binary",
);
check(
  "empty file skipped",
  "skipped" in scanInChunks(buf(""), 1) ? "empty" : "not skipped",
  "empty",
);
check(
  "shebang read from the first chunk",
  (() => {
    const outcome = scanInChunks(buf("#!/usr/bin/env python3\nx = 1\n"), 5, "run");
    return "file" in outcome ? outcome.file.language : "none";
  })(),
  "Python",
);
check(
  "byte count is exact",
  (() => {
    const outcome = scanInChunks(buf("hello world"), 2);
    return "file" in outcome ? outcome.file.bytes : -1;
  })(),
  11,
);
check(
  "a NUL past the sniff window does not mark binary",
  (() => {
    const content = Buffer.concat([
      Buffer.alloc(9000, 0x61),
      Buffer.from([0x00]),
    ]);
    const outcome = scanInChunks(content, 512);
    return "file" in outcome;
  })(),
  true,
);

console.log("");
console.log("SnapshotAccumulator matches analyze()");

// The same tree the array-based analyze() test uses, pushed through the
// streaming path. Both must agree, or the two code paths have drifted.
const streamedEntries: Array<[string, Buffer]> = [
  ["src/index.ts", buf("const a = 1;\nconst b = 2;\n")],
  ["src/util.js", buf("module.exports = {};\n")],
  ["README.md", buf("# Title\n\nText\n")],
  ["scripts/build", buf("#!/usr/bin/env bash\nset -e\n")],
  ["node_modules/left-pad/index.js", buf("module.exports = 1;\n")],
  ["packages/web/node_modules/dep/x.js", buf("var x = 1;\n")],
  [".git/HEAD", buf("ref: refs/heads/main\n")],
  ["dist/bundle.js", buf("var y=1;\n")],
  ["public/vendor.min.js", buf("!function(){}();\n")],
  ["package-lock.json", buf('{"lockfileVersion":3}\n')],
  ["assets/logo.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01])],
  ["data/blob.custom", Buffer.from([0x01, 0x00, 0x02, 0x03])],
  ["empty.ts", buf("")],
  ["src/index.ts", buf("this should be ignored\n")],
  ["./src/win.ts", buf("export {};\n")],
];

const acc = new SnapshotAccumulator(true);
for (const [path, content] of streamedEntries) {
  const target = acc.shouldRead(path);
  if (!target) continue;
  const scanner = new FileScanner(target.captureLimit);
  // Deliberately tiny chunks.
  for (let i = 0; i < content.length; i += 3) {
    scanner.update(content.subarray(i, i + 3));
  }
  acc.add(scanner.finish(target.path));
}
const streamed = acc.finish();

check("streamed file count matches", streamed.analysis.totalFiles, result.totalFiles);
check("streamed line count matches", streamed.analysis.totalLines, result.totalLines);
check("streamed byte count matches", streamed.analysis.totalBytes, result.totalBytes);
check(
  "streamed languages match",
  streamed.analysis.languages.map((l) => l.language).sort(),
  result.languages.map((l) => l.language).sort(),
);
check("streamed excluded count matches", streamed.analysis.skipped.excluded, result.skipped.excluded);
check("streamed binary count matches", streamed.analysis.skipped.binary, result.skipped.binary);
check("streamed empty count matches", streamed.analysis.skipped.empty, result.skipped.empty);

console.log("");
console.log("streaming captures manifests only");
const manifestAcc = new SnapshotAccumulator(false);
const capture: Record<string, number> = {};
for (const [path, content] of [
  ["package.json", buf('{"dependencies":{"react":"^19.0.0"}}')],
  ["prisma/schema.prisma", buf('datasource db {\n  provider = "mysql"\n}\n')],
  ["src/big.ts", buf("export const x = 1;\n")],
  ["api/requirements.txt", buf("Django==5.0.1\n")],
] as Array<[string, Buffer]>) {
  const target = manifestAcc.shouldRead(path);
  if (!target) continue;
  capture[path] = target.captureLimit;
  const scanner = new FileScanner(target.captureLimit);
  scanner.update(content);
  manifestAcc.add(scanner.finish(target.path));
}
check("package.json body is retained", capture["package.json"] > 0, true);
check("schema.prisma body is retained", capture["prisma/schema.prisma"] > 0, true);
check("requirements.txt body is retained", capture["api/requirements.txt"] > 0, true);
check("ordinary source body is NOT retained", capture["src/big.ts"], 0);

const manifestResult = manifestAcc.finish();
check(
  "dependencies parsed from the captured manifests",
  manifestResult.dependencies.dependencies.map((d) => d.name).sort(),
  ["Django", "react"],
);
check(
  "prisma provider detected while streaming",
  manifestResult.detected.find((t) => t.name === "MySQL")?.evidence,
  'schema.prisma provider "mysql"',
);
check(
  "per-file rows omitted when not tracking",
  manifestResult.analysis.files.length,
  0,
);

// ---------------------------------------------------------------------------
// Findings
//
// Weighted heavily toward false positives, because that is the failure mode
// that would make the whole panel worthless: a wrongly-flagged tsconfig.json
// or a "your secrets are exposed" on a properly ignored .env teaches the owner
// to stop reading findings altogether.
// ---------------------------------------------------------------------------

console.log("\nJSON and JSONC syntax");
const ruleOf = (path: string, source: string) =>
  validateStructured(path, buf(source))?.rule ?? null;

check("valid JSON passes", ruleOf("data.json", '{"a":1}'), null);
check("broken JSON is an error", ruleOf("data.json", '{"a":}'), "json-invalid");
check(
  "the reported line is the broken one",
  validateStructured("data.json", buf('{\n  "a": 1,\n  "b":\n}'))?.detail.includes(
    "line 4",
  ),
  true,
);
check(
  "tsconfig.json may have comments and trailing commas",
  ruleOf(
    "tsconfig.json",
    '{\n  // a comment\n  "compilerOptions": {\n    "strict": true,\n  },\n}',
  ),
  null,
);
check(
  "tsconfig.build.json is treated as JSONC too",
  ruleOf("tsconfig.build.json", '{\n  /* block */ "extends": "./tsconfig.json",\n}'),
  null,
);
check(
  "a genuinely broken tsconfig is still an error",
  ruleOf("tsconfig.json", '{\n  // fine\n  "a": \n}'),
  "json-invalid",
);
check(
  "package.json is held to strict JSON",
  ruleOf("package.json", '{\n  // npm will not accept this\n  "name": "x"\n}'),
  "json-invalid",
);
check(
  "a URL inside a string is not a comment",
  ruleOf("data.json", '{"home":"https://example.com/x"}'),
  null,
);
check("a BOM does not break parsing", ruleOf("data.json", '﻿{"a":1}'), null);
check("an empty file is not a finding", ruleOf("data.json", "   \n"), null);

console.log("\nrelaxJsonc");
check(
  "length is preserved so offsets still map",
  relaxJsonc('{"a":1} // tail').length,
  '{"a":1} // tail'.length,
);
check(
  "a comment marker inside a string survives",
  relaxJsonc('{"u":"a//b"}'),
  '{"u":"a//b"}',
);
check(
  "newlines inside block comments survive",
  relaxJsonc("{/* x\ny */}").split("\n").length,
  2,
);

console.log("\nYAML syntax");
check(
  "valid YAML passes",
  ruleOf("ci.yml", "name: build\non:\n  push:\n    branches: [main]\n"),
  null,
);
check("broken YAML is an error", ruleOf("ci.yml", "a: [1,\n"), "yaml-invalid");
check(
  "a multi-document file is not an error",
  ruleOf("k8s.yaml", "kind: A\n---\nkind: B\n"),
  null,
);
check(
  "a Helm-style template is not judged",
  ruleOf("templates/deploy.yaml", "name: {{ .Release.Name }\nbad: [\n"),
  null,
);
check(
  "an unknown custom tag is not our error",
  ruleOf("stack.yml", "Resources:\n  X: !Ref Thing\n"),
  null,
);

console.log("\nPrisma schema");
check(
  "a balanced schema passes",
  ruleOf("schema.prisma", 'model A {\n  id String @id // }\n}\n'),
  null,
);
check(
  "an unclosed block is reported",
  ruleOf("schema.prisma", "model A {\n  id String\n"),
  "prisma-unbalanced",
);
check(
  "a stray closing brace is reported",
  ruleOf("schema.prisma", "model A {\n}\n}\n"),
  "prisma-unbalanced",
);
check(
  "a brace inside a string is not counted",
  ruleOf("schema.prisma", 'model A {\n  x String @default("{")\n}\n'),
  null,
);

console.log("\ngitignoreCovers");
check("exact name", gitignoreCovers(".env\n", ".env"), true);
check("glob suffix", gitignoreCovers(".env*\n", ".env.production"), true);
check("anchored to root", gitignoreCovers("/.env\n", ".env"), true);
check("nested path matched by bare name", gitignoreCovers(".env\n", "api/.env"), true);
check("a different rule does not cover it", gitignoreCovers("*.log\n", ".env"), false);
check("comments are ignored", gitignoreCovers("# .env\n", ".env"), false);
check(
  "a later negation re-includes the file",
  gitignoreCovers(".env*\n!.env.production\n", ".env.production"),
  false,
);

console.log("\nHygieneCollector");
function hygieneRules(
  paths: string[],
  options: { gitignore?: string; raw?: string[] } = {},
): string[] {
  const collector = new HygieneCollector();
  for (const path of options.raw ?? []) collector.observeRaw(path);
  for (const path of paths) {
    collector.observeRaw(path);
    collector.observe(path);
  }
  if (options.gitignore !== undefined) {
    collector.setGitignore(options.gitignore);
  }
  return collector.finish().map((f) => f.rule);
}

check(
  "package.json with no lockfile warns",
  hygieneRules(["package.json", "readme.md", "a.test.ts"]),
  ["lockfile-missing"],
);
check(
  "a lockfile seen only as an excluded path still counts",
  hygieneRules(["package.json", "readme.md", "a.test.ts"], {
    raw: ["package-lock.json"],
  }),
  [],
);
check(
  "an unignored .env is an error",
  hygieneRules(["readme.md", "a.test.ts", ".env"], { gitignore: "node_modules\n" }),
  ["env-not-ignored"],
);
check(
  "an ignored .env is silent",
  hygieneRules(["readme.md", "a.test.ts", ".env"], { gitignore: ".env\n" }),
  [],
);
check(
  "a .env with no .gitignore at all only warns",
  hygieneRules(["readme.md", "a.test.ts", ".env"]),
  ["env-no-gitignore"],
);
check(
  ".env.example is not a leaked secret",
  hygieneRules(["readme.md", "a.test.ts", ".env.example"], { gitignore: "" }),
  [],
);
check(
  "missing tests and readme are notes",
  hygieneRules(["src/a.ts"]),
  ["tests-absent", "readme-absent"],
);
check(
  "a tests/ directory satisfies the test check",
  hygieneRules(["readme.md", "tests/thing.py"]),
  [],
);
check(
  "a Go-style _test.go satisfies it",
  hygieneRules(["readme.md", "main_test.go"]),
  [],
);
check(
  "README with any extension counts",
  hygieneRules(["README.rst", "a.spec.js"]),
  [],
);

console.log("\nfindings through the accumulator");
function runAccumulator(files: Array<[string, string]>, keepFiles = false) {
  const accumulator = new SnapshotAccumulator(keepFiles);
  for (const [path, content] of files) {
    const target = accumulator.shouldRead(path);
    if (!target) continue;
    const scanner = new FileScanner(target.captureLimit);
    scanner.update(buf(content));
    accumulator.add(scanner.finish(target.path));
  }
  return accumulator.finish();
}

const brokenTree = runAccumulator([
  ["package.json", '{"dependencies":{"react":"^19.0.0"}'],
  ["package-lock.json", "{}"],
  [".gitignore", "node_modules\n"],
  [".env", "SECRET=1\n"],
  ["README.md", "# x\n"],
  ["src/a.test.ts", "test\n"],
]);
check(
  "a broken manifest and a leaked .env are both reported",
  brokenTree.findings.map((f) => f.rule),
  ["env-not-ignored", "json-invalid"],
);
check(
  "one broken file produces one row, not two",
  brokenTree.findings.filter((f) => f.rule === "manifest-unreadable").length,
  0,
);
check(
  "the dependency reader still reports the same file as a problem",
  brokenTree.dependencies.problems.length,
  1,
);

const vendored = runAccumulator([
  ["README.md", "# x\n"],
  ["node_modules/dep/test/spec.js", "it()\n"],
  ["src/a.ts", "export {}\n"],
]);
check(
  "a test directory inside node_modules does not count as tests",
  vendored.findings.map((f) => f.rule),
  ["tests-absent"],
);

const rooted = runAccumulator([
  ["myproject/package.json", '{"name":}'],
  ["myproject/package-lock.json", "{}"],
  ["myproject/README.md", "# x\n"],
  ["myproject/src/a.test.ts", "t\n"],
]);
check(
  "the shared root is stripped from finding paths too",
  rooted.findings.map((f) => f.path),
  ["package.json"],
);

// A body that stopped at the capture limit is a prefix. Parsing it would
// report a syntax error in a file that is perfectly fine.
const truncatedAcc = new SnapshotAccumulator(false);
const truncTarget = truncatedAcc.shouldRead("big.json");
const truncScanner = new FileScanner(8);
truncScanner.update(buf('{"a":"aaaaaaaaaaaaaaaaaaaa"}'));
truncatedAcc.add(truncScanner.finish(truncTarget!.path));
check(
  "a truncated body is never reported as broken syntax",
  truncatedAcc
    .finish()
    .findings.filter((f) => f.rule === "json-invalid").length,
  0,
);

console.log("\nprojectHealth");
const sev = (...list: Array<"ERROR" | "WARN" | "INFO">) =>
  list.map((severity) => ({ severity }));

check(
  "an error means attention",
  projectHealth({ scanned: true, findings: sev("ERROR", "INFO") }).level,
  "ATTENTION",
);
check(
  "warnings alone are minor",
  projectHealth({ scanned: true, findings: sev("WARN", "INFO") }).level,
  "MINOR",
);
check(
  "notes alone are still clean",
  projectHealth({ scanned: true, findings: sev("INFO") }).level,
  "CLEAN",
);
check(
  "nothing found and scanned is clean",
  projectHealth({ scanned: true, findings: [] }).level,
  "CLEAN",
);
check(
  "nothing found and never scanned is not clean",
  projectHealth({ scanned: false, findings: [] }).level,
  "UNSCANNED",
);
// The flag arrived after findings did, so rows must outrank it — otherwise a
// snapshot written in between reports "not scanned" while listing findings.
check(
  "rows outrank a false scanned flag",
  projectHealth({ scanned: false, findings: sev("ERROR") }).level,
  "ATTENTION",
);
check(
  "the detail states what it was derived from",
  projectHealth({ scanned: true, findings: sev("ERROR", "ERROR") }).detail,
  "2 errors in the latest scan.",
);

console.log("\nanalyseProject");
const snap = (
  daysAgo: number,
  lines: number,
  files: number,
  languages: Array<[string, number]>,
) => ({
  createdAt: new Date(Date.now() - daysAgo * 86400000),
  totalLines: lines,
  totalFiles: files,
  totalBytes: lines * 20,
  languageStats: languages.map(([language, l]) => ({ language, lines: l })),
});

const oneSnapshot = analyseProject({
  snapshots: [snap(0, 100, 10, [["TypeScript", 60], ["Python", 40]])],
  dependencies: [],
});
check(
  "roles are grouped by what a language is for",
  oneSnapshot.roles.map((r) => [r.role, r.lines]),
  [
    ["Front end", 60],
    ["Back end", 40],
  ],
);
check("one snapshot cannot show growth", oneSnapshot.growth, null);
check(
  "concentration counts the languages reaching 90%",
  oneSnapshot.concentration,
  {
    topLanguage: "TypeScript",
    topShare: 60,
    languagesFor90: 2,
    totalLanguages: 2,
  },
);
check("lines per file", oneSnapshot.size?.linesPerFile, 10);

const grown = analyseProject({
  snapshots: [
    snap(10, 100, 10, [["TypeScript", 100]]),
    snap(0, 400, 20, [["TypeScript", 400]]),
  ],
  dependencies: [],
});
check("growth delta", grown.growth?.delta, 300);
check("growth per day over ten days", grown.growth?.perDay, 30);

// A rate computed over minutes is arithmetic, not measurement: three re-scans
// in an afternoon would read as tens of thousands of lines a day.
const sameDay = analyseProject({
  snapshots: [
    snap(0.02, 100, 10, [["TypeScript", 100]]),
    snap(0, 400, 20, [["TypeScript", 400]]),
  ],
  dependencies: [],
});
check("no per-day rate under a day of history", sameDay.growth?.perDay, null);
check("but the delta is still reported", sameDay.growth?.delta, 300);

const unknown = analyseProject({
  snapshots: [snap(0, 50, 5, [["Other", 50]])],
  dependencies: [],
});
check(
  "the analyzer's own catch-all is surfaced, not dropped",
  unknown.roles.map((r) => r.role),
  ["Unclassified"],
);

const withDeps = analyseProject({
  snapshots: [snap(0, 10, 1, [["TypeScript", 10]])],
  dependencies: [
    { scope: "RUNTIME", manager: "NPM" },
    { scope: "RUNTIME", manager: "NPM" },
    { scope: "DEV", manager: "NPM" },
    { scope: "RUNTIME", manager: "PIP" },
  ],
});
check("dependency scopes counted", withDeps.dependencies.byScope, [
  { scope: "RUNTIME", count: 3 },
  { scope: "DEV", count: 1 },
]);
check("managers listed once each", withDeps.dependencies.managers, [
  "NPM",
  "PIP",
]);

const empty = analyseProject({ snapshots: [], dependencies: [] });
check("no snapshots is not a crash", [
  empty.roles.length,
  empty.growth,
  empty.concentration,
  empty.size,
], [0, null, null, null]);

console.log("\nfolderNameFrom");
check(
  "a real folder path gives the folder",
  folderNameFrom("myproject/src/a.ts", "a.ts"),
  "myproject",
);
// react-dropzone reports "./a/b.ts", and taking the first segment blindly
// produced projects literally named ".".
check(
  "a ./ prefix is not a folder name",
  folderNameFrom("./myproject/src/a.ts", "a.ts"),
  "myproject",
);
check(
  "a flat ./ path falls back to the filename",
  folderNameFrom("./a.ts", "a.ts"),
  "a.ts",
);
check("windows separators", folderNameFrom("proj\\src\\a.ts", "a.ts"), "proj");
check("no path at all", folderNameFrom(null, "a.ts"), "a.ts");
check("nothing at all", folderNameFrom(null, null), "upload");

console.log("\nupload cursor");
const evenFiles = [
  { path: "a", size: 100 },
  { path: "b", size: 100 },
  { path: "c", size: 100 },
  { path: "d", size: 100 },
];
check("start of the upload", cursorIndex(evenFiles, 0), 0);
check("halfway", cursorIndex(evenFiles, 0.5), 1);
check("end", cursorIndex(evenFiles, 1), 3);
check("past the end is clamped", cursorIndex(evenFiles, 5), 3);
check("negative is clamped", cursorIndex(evenFiles, -2), 0);

// The reason for walking cumulative sizes: with one huge file the log must sit
// on it for most of the upload rather than sprinting to the last name.
const lopsided = [
  { path: "small-1", size: 10 },
  { path: "huge", size: 9000 },
  { path: "small-2", size: 10 },
];
check("a huge file holds the cursor", cursorIndex(lopsided, 0.5), 1);
check("and still resolves at the end", cursorIndex(lopsided, 1), 2);

check("no files is not a crash", cursorIndex([], 0.5), 0);
check(
  "all-empty files fall back to position",
  cursorIndex(
    [
      { path: "a", size: 0 },
      { path: "b", size: 0 },
      { path: "c", size: 0 },
      { path: "d", size: 0 },
    ],
    0.5,
  ),
  2,
);

console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
