// Linguist-style language table. Extension first, then exact filename, then
// shebang. Deliberately not exhaustive — it covers what a working developer
// actually has on disk, and anything unrecognised is counted under "Other".

/** Extension (no dot, lowercase) -> language name. */
export const EXTENSION_LANGUAGES: Record<string, string> = {
  // Web
  ts: "TypeScript",
  tsx: "TypeScript",
  mts: "TypeScript",
  cts: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript",
  mjs: "JavaScript",
  cjs: "JavaScript",
  vue: "Vue",
  svelte: "Svelte",
  astro: "Astro",
  html: "HTML",
  htm: "HTML",
  css: "CSS",
  scss: "SCSS",
  sass: "Sass",
  less: "Less",

  // Backend / systems
  py: "Python",
  pyi: "Python",
  rb: "Ruby",
  php: "PHP",
  go: "Go",
  rs: "Rust",
  java: "Java",
  kt: "Kotlin",
  kts: "Kotlin",
  scala: "Scala",
  cs: "C#",
  fs: "F#",
  c: "C",
  h: "C",
  cc: "C++",
  cpp: "C++",
  cxx: "C++",
  hpp: "C++",
  hh: "C++",
  m: "Objective-C",
  mm: "Objective-C++",
  swift: "Swift",
  dart: "Dart",
  ex: "Elixir",
  exs: "Elixir",
  erl: "Erlang",
  clj: "Clojure",
  hs: "Haskell",
  lua: "Lua",
  pl: "Perl",
  r: "R",
  jl: "Julia",
  zig: "Zig",

  // Shell / config / data
  sh: "Shell",
  bash: "Shell",
  zsh: "Shell",
  fish: "Shell",
  ps1: "PowerShell",
  psm1: "PowerShell",
  bat: "Batchfile",
  cmd: "Batchfile",
  sql: "SQL",
  prisma: "Prisma",
  graphql: "GraphQL",
  gql: "GraphQL",
  json: "JSON",
  jsonc: "JSON",
  yml: "YAML",
  yaml: "YAML",
  toml: "TOML",
  ini: "INI",
  cfg: "INI",
  xml: "XML",
  md: "Markdown",
  mdx: "MDX",
  rst: "reStructuredText",
  tex: "TeX",
  dockerfile: "Dockerfile",
  tf: "Terraform",
  proto: "Protocol Buffer",
  ipynb: "Jupyter Notebook",
};

/** Exact filename (lowercased) -> language, for files with no useful extension. */
export const FILENAME_LANGUAGES: Record<string, string> = {
  dockerfile: "Dockerfile",
  containerfile: "Dockerfile",
  makefile: "Makefile",
  gnumakefile: "Makefile",
  rakefile: "Ruby",
  gemfile: "Ruby",
  procfile: "Procfile",
  cmakelists: "CMake",
  "cmakelists.txt": "CMake",
  ".gitignore": "Ignore List",
  ".dockerignore": "Ignore List",
  ".npmignore": "Ignore List",
  ".editorconfig": "EditorConfig",
  ".env": "Dotenv",
  ".env.example": "Dotenv",
};

/**
 * Interpreter name as it appears in a shebang -> language. Matched against the
 * basename, so `#!/usr/bin/env python3.11` and `#!/bin/bash` both resolve.
 */
export const SHEBANG_LANGUAGES: Array<[RegExp, string]> = [
  [/^python[\d.]*$/, "Python"],
  [/^(bash|sh|zsh|dash|ksh)$/, "Shell"],
  [/^(node|nodejs|bun|deno)$/, "JavaScript"],
  [/^ruby$/, "Ruby"],
  [/^perl$/, "Perl"],
  [/^php$/, "PHP"],
  [/^(Rscript|R)$/, "R"],
  [/^lua[\d.]*$/, "Lua"],
  [/^(pwsh|powershell)$/, "PowerShell"],
  [/^elixir$/, "Elixir"],
];

export const OTHER_LANGUAGE = "Other";
