/**
 * Guards the landing page against drift.
 *
 * The showcase names specific languages and technologies, and the counts in
 * its intro are stated as facts. Both are only true while the rule tables say
 * so, and a marketing claim that outlives its rule is worse than no claim. So
 * this reads the real tables and fails if the page has got ahead of them.
 *
 * Deliberately source-level rather than importing the modules: the numbers in
 * the copy are prose, not exports, so there is nothing to import.
 */
import { readFileSync } from "node:fs";

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

const tech = readFileSync("src/lib/analyzer/tech.ts", "utf8");
const languages = readFileSync("src/lib/analyzer/languages.ts", "utf8");
const showcase = readFileSync("src/components/StackShowcase.tsx", "utf8");
const landing = readFileSync("src/app/page.tsx", "utf8");
const info = readFileSync("src/lib/languageInfo.ts", "utf8");

// --- names any rule can emit ---
const techNames = new Set<string>();
for (const m of tech.matchAll(/name:\s*"([^"]+)"/g)) techNames.add(m[1]);
const providerBlock = tech.slice(
  tech.indexOf("PRISMA_PROVIDERS"),
  tech.indexOf("function basenameOf"),
);
for (const m of providerBlock.matchAll(/:\s*"([^"]+)"/g)) techNames.add(m[1]);

const languageNames = new Set<string>();
const notALanguage = (v: string) =>
  v.includes("ui-") || v.includes("Cascadia") || v.includes("system-ui");
for (const m of languages.matchAll(/:\s*"([A-Za-z+#][A-Za-z+#\s.-]*)"/g)) {
  if (!notALanguage(m[1])) languageNames.add(m[1]);
}
for (const m of languages.matchAll(/\],\s*"([A-Za-z+#][A-Za-z+#\s.-]*)"\]/g)) {
  languageNames.add(m[1]);
}

console.log("\nlanding page claims match the rule tables");
check("language count in the copy", languageNames.size, 60);
check("technology count in the copy", techNames.size, 119);

// The counts are written into the prose, so assert the prose itself.
check(
  "copy states the language count",
  showcase.includes(`${languageNames.size} languages`),
  true,
);
check(
  "copy states the technology count",
  showcase.includes(`${techNames.size} frameworks and tools`),
  true,
);

// The landing copy quotes a rule *count*, which is a different number from
// the count of distinct names — several rules can point at one technology
// (react and react-dom both mean React). Both claims are asserted.
const depBlock = tech.slice(
  tech.indexOf("const DEPENDENCY_RULES"),
  tech.indexOf("const FILE_RULES"),
);
const fileBlock = tech.slice(
  tech.indexOf("const FILE_RULES"),
  tech.indexOf("PRISMA_PROVIDERS"),
);
const ruleCount =
  [...depBlock.matchAll(/name:\s*"/g)].length +
  [...fileBlock.matchAll(/name:\s*"/g)].length;

check("rule count in the landing copy", ruleCount, 152);
check(
  "landing copy states the rule count",
  landing.includes(`${ruleCount} rules across manifests and config files`),
  true,
);
check(
  "landing copy states the language count",
  landing.includes(`${languageNames.size} languages`),
  true,
);

// --- every name the showcase lists must be producible ---
const claimed = new Set<string>();
for (const m of showcase.matchAll(/name:\s*"([^"]+)"/g)) claimed.add(m[1]);
for (const block of showcase.matchAll(/also:\s*\[([\s\S]*?)\]/g)) {
  for (const m of block[1].matchAll(/"([^"]+)"/g)) claimed.add(m[1]);
}

/** One card pairs two engines under a single label. */
const ALLOWED_COMPOUNDS = new Set(["MySQL / MariaDB"]);
const known = new Set([...techNames, ...languageNames]);
const unbacked = [...claimed].filter(
  (name) => !known.has(name) && !ALLOWED_COMPOUNDS.has(name),
);

check("every showcase entry maps to a real rule", unbacked, []);
check("the showcase is not empty", claimed.size > 50, true);

// --- language explanations must describe real languages ---
const described = new Set<string>();
for (const m of info.matchAll(/^\s{2}"?([A-Za-z+#][A-Za-z+#\s.-]*?)"?:\s*\{$/gm)) {
  described.add(m[1]);
}
const ghosts = [...described].filter((name) => !languageNames.has(name));
check("no explanation describes a language the analyzer cannot report", ghosts, []);

console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
