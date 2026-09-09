import { createHash } from "node:crypto";
import {
  EXTENSION_LANGUAGES,
  FILENAME_LANGUAGES,
  OTHER_LANGUAGE,
  SHEBANG_LANGUAGES,
} from "./languages";
import { isExcludedPath, looksBinary, normalizePath } from "./exclude";

export type RawEntry = { path: string; content: Buffer };

export type AnalyzedFile = {
  path: string;
  pathHash: string;
  language: string;
  lines: number;
  bytes: number;
};

export type LanguageTotals = {
  language: string;
  fileCount: number;
  lines: number;
  bytes: number;
};

export type AnalysisResult = {
  files: AnalyzedFile[];
  languages: LanguageTotals[];
  totalFiles: number;
  totalLines: number;
  totalBytes: number;
  /** Counts of what was thrown away, so the UI can explain the numbers. */
  skipped: { excluded: number; binary: number; empty: number };
};

/**
 * Counts lines the way `wc -l` would if it also counted a trailing partial
 * line. CRLF collapses to one line because only "\n" is counted; a file with
 * no trailing newline still counts its last line.
 */
export function countLines(content: Buffer): number {
  if (content.length === 0) return 0;

  let newlines = 0;
  for (let i = 0; i < content.length; i += 1) {
    if (content[i] === 0x0a) newlines += 1;
  }

  // Trailing newline means the last line is already counted.
  const endsWithNewline = content[content.length - 1] === 0x0a;
  return endsWithNewline ? newlines : newlines + 1;
}

function extensionOf(filename: string): string | null {
  const dot = filename.lastIndexOf(".");
  // A leading dot is the whole name (".gitignore"), not an extension.
  if (dot <= 0 || dot === filename.length - 1) return null;
  return filename.slice(dot + 1).toLowerCase();
}

/**
 * Reads the interpreter out of a shebang. Returns null when the file does not
 * start with "#!", so this is safe to call on anything.
 */
export function languageFromShebang(content: Buffer): string | null {
  if (content.length < 3) return null;
  if (content[0] !== 0x23 || content[1] !== 0x21) return null; // "#!"

  const firstLine = content
    .subarray(2, Math.min(content.length, 256))
    .toString("utf8")
    .split("\n")[0]
    .trim();

  // "/usr/bin/env python3 -u" -> ["/usr/bin/env", "python3", "-u"]
  const parts = firstLine.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;

  // With `env`, the interpreter is the first argument that is not a flag or a
  // VAR=value assignment.
  let interpreter = parts[0];
  if (/(^|\/)env$/.test(interpreter)) {
    const next = parts.slice(1).find((p) => !p.startsWith("-") && !p.includes("="));
    if (!next) return null;
    interpreter = next;
  }

  const basename = interpreter.split("/").pop() ?? interpreter;

  for (const [pattern, language] of SHEBANG_LANGUAGES) {
    if (pattern.test(basename)) return language;
  }
  return null;
}

/** Extension, then exact filename, then shebang, then "Other". */
export function detectLanguage(path: string, content: Buffer): string {
  const filename = path.split("/").pop() ?? path;
  const lowerName = filename.toLowerCase();

  const extension = extensionOf(filename);
  if (extension && EXTENSION_LANGUAGES[extension]) {
    return EXTENSION_LANGUAGES[extension];
  }

  if (FILENAME_LANGUAGES[lowerName]) return FILENAME_LANGUAGES[lowerName];

  // "Dockerfile.dev", ".env.local" — match on the leading segment.
  const leading = lowerName.split(".")[0];
  if (leading && FILENAME_LANGUAGES[leading]) return FILENAME_LANGUAGES[leading];

  const shebang = languageFromShebang(content);
  if (shebang) return shebang;

  return OTHER_LANGUAGE;
}

export function hashPath(path: string): string {
  return createHash("sha256").update(path, "utf8").digest("hex");
}

/**
 * Turns a flat list of files into everything a ProjectSnapshot needs. Pure and
 * synchronous: no filesystem, no database, so it is trivially testable.
 */
export function analyze(entries: RawEntry[]): AnalysisResult {
  const files: AnalyzedFile[] = [];
  const totals = new Map<string, LanguageTotals>();
  const skipped = { excluded: 0, binary: 0, empty: 0 };
  const seen = new Set<string>();

  for (const entry of entries) {
    const path = normalizePath(entry.path);
    if (!path) continue;

    if (isExcludedPath(path)) {
      skipped.excluded += 1;
      continue;
    }
    if (entry.content.length === 0) {
      skipped.empty += 1;
      continue;
    }
    if (looksBinary(entry.content)) {
      skipped.binary += 1;
      continue;
    }

    // A zip can legitimately contain the same path twice; keep the first.
    const pathHash = hashPath(path);
    if (seen.has(pathHash)) continue;
    seen.add(pathHash);

    const language = detectLanguage(path, entry.content);
    const lines = countLines(entry.content);
    const bytes = entry.content.length;

    files.push({ path, pathHash, language, lines, bytes });

    const running = totals.get(language) ?? {
      language,
      fileCount: 0,
      lines: 0,
      bytes: 0,
    };
    running.fileCount += 1;
    running.lines += lines;
    running.bytes += bytes;
    totals.set(language, running);
  }

  const languages = [...totals.values()].sort((a, b) => b.bytes - a.bytes);

  return {
    files,
    languages,
    totalFiles: files.length,
    totalLines: files.reduce((sum, f) => sum + f.lines, 0),
    totalBytes: files.reduce((sum, f) => sum + f.bytes, 0),
    skipped,
  };
}

/** Byte-share percentages, derived rather than stored. */
export function languagePercentages(
  languages: LanguageTotals[],
): Array<LanguageTotals & { percent: number }> {
  const total = languages.reduce((sum, l) => sum + l.bytes, 0);
  if (total === 0) return languages.map((l) => ({ ...l, percent: 0 }));
  return languages.map((l) => ({
    ...l,
    percent: (l.bytes / total) * 100,
  }));
}
