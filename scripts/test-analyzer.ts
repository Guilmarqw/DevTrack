import { isUnsafeEntryPath } from "../src/lib/upload/stream";
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

console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
