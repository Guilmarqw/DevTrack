import { detectLanguage, hashPath, type AnalysisResult, type RawEntry } from "./analyze";
import { isExcludedPath, normalizePath } from "./exclude";
import {
  isManifestPath,
  MAX_MANIFEST_BYTES,
  scanDependencies,
  type DependencyScan,
} from "./dependencies";
import { TechCollector, type DetectedTech } from "./tech";
import {
  HygieneCollector,
  manifestProblemFindings,
  sortFindings,
  structuredKind,
  validateStructured,
  MAX_STRUCTURED_FILE_BYTES,
  MAX_STRUCTURED_FILES,
  MAX_STRUCTURED_TOTAL_BYTES,
  type Finding,
} from "./findings";

/**
 * Incremental analysis, so upload size stops mattering.
 *
 * The array-based `analyze()` needs every file's contents in memory at once,
 * which is what forced a size cap. This path folds one chunk at a time and
 * keeps only:
 *
 *   - the first 8 KB of the current file, for the binary sniff and shebang;
 *   - running counters and one row per language;
 *   - the bodies of dependency manifests and schema.prisma, which are the only
 *     files whose contents anything downstream needs;
 *   - one row per file, and only when the project opted into per-file tracking.
 *
 * Structured files are the one apparent exception, and are not really one:
 * their bodies are captured, parsed in `add()` and dropped in the same call,
 * so only the resulting findings survive. Nothing accumulates per file.
 *
 * So peak memory tracks the number of *files*, not their size. A 40 GB upload
 * costs about what a 40 MB one does.
 */

const SNIFF_BYTES = 8192;
const NEWLINE = 0x0a;

/** Ceiling on retained manifest bodies, so a repo full of them stays bounded. */
const MAX_RETAINED_MANIFEST_BYTES = 32 * 1024 * 1024;

export type ScannedFile = {
  path: string;
  pathHash: string;
  language: string;
  lines: number;
  bytes: number;
};

export type ScanOutcome =
  | { file: ScannedFile; captured: Buffer | null }
  | { skipped: "binary" | "empty" };

/**
 * Counts a single file as its bytes arrive.
 *
 * `captureLimit` above zero also retains the body up to that many bytes —
 * used only for manifests, never for ordinary source.
 */
export class FileScanner {
  private readonly head: Buffer[] = [];
  private readonly capture: Buffer[] = [];
  private headBytes = 0;
  private capturedBytes = 0;
  private newlines = 0;
  private bytes = 0;
  private lastByte: number | null = null;
  private binary = false;

  constructor(private readonly captureLimit = 0) {}

  update(chunk: Buffer): void {
    const startedAt = this.bytes;
    this.bytes += chunk.length;

    // Keep just enough of the start to sniff and read a shebang.
    //
    // Buffer.from copies. subarray would return a *view*, which keeps the
    // whole parent chunk alive — and the parent here is one of the reader's
    // 64 KB buffers. Holding an 8 KB view of it therefore pins 64 KB per
    // file, which is how a 60,000-file upload ended up needing gigabytes.
    if (this.headBytes < SNIFF_BYTES) {
      const wanted = Math.min(chunk.length, SNIFF_BYTES - this.headBytes);
      this.head.push(Buffer.from(chunk.subarray(0, wanted)));
      this.headBytes += wanted;
    }

    if (this.captureLimit > 0 && this.capturedBytes < this.captureLimit) {
      const wanted = Math.min(
        chunk.length,
        this.captureLimit - this.capturedBytes,
      );
      this.capture.push(Buffer.from(chunk.subarray(0, wanted)));
      this.capturedBytes += wanted;
    }

    // A NUL anywhere in the sniff window means binary — the same test git
    // uses. Only the window is examined.
    if (!this.binary && startedAt < SNIFF_BYTES) {
      const limit = Math.min(chunk.length, SNIFF_BYTES - startedAt);
      for (let i = 0; i < limit; i += 1) {
        if (chunk[i] === 0) {
          this.binary = true;
          break;
        }
      }
    }

    for (let i = 0; i < chunk.length; i += 1) {
      if (chunk[i] === NEWLINE) this.newlines += 1;
    }

    if (chunk.length > 0) this.lastByte = chunk[chunk.length - 1];
  }

  finish(path: string): ScanOutcome {
    if (this.bytes === 0) return { skipped: "empty" };
    if (this.binary) return { skipped: "binary" };

    // Matches countLines(): a trailing newline means the last line is already
    // counted; otherwise the final partial line counts too.
    const lines = this.lastByte === NEWLINE ? this.newlines : this.newlines + 1;

    const head = Buffer.concat(this.head);
    const captured = this.captureLimit > 0 ? Buffer.concat(this.capture) : null;

    // Release the retained chunks now rather than waiting for the scanner
    // itself to become unreachable. With tens of thousands of files in flight
    // the difference is hundreds of megabytes.
    this.head.length = 0;
    this.capture.length = 0;

    return {
      file: {
        path,
        pathHash: hashPath(path),
        language: detectLanguage(path, head),
        lines,
        bytes: this.bytes,
      },
      captured,
    };
  }
}

type LanguageRunning = {
  language: string;
  fileCount: number;
  lines: number;
  bytes: number;
};

export type StreamedAnalysis = {
  analysis: AnalysisResult;
  dependencies: DependencyScan;
  detected: DetectedTech[];
  findings: Finding[];
};

/**
 * Folds scanned files into everything a ProjectSnapshot needs, producing the
 * same shapes the array-based path did so nothing downstream has to know which
 * one ran.
 */
export class SnapshotAccumulator {
  private readonly languages = new Map<string, LanguageRunning>();
  private readonly files: ScannedFile[] = [];
  private readonly seen = new Set<string>();
  private readonly skipped = { excluded: 0, binary: 0, empty: 0 };
  private readonly manifests: RawEntry[] = [];
  private readonly tech = new TechCollector();
  private readonly hygiene = new HygieneCollector();
  private readonly findings: Finding[] = [];
  private manifestBytes = 0;
  private structuredFiles = 0;
  private structuredBytes = 0;
  private totalFiles = 0;
  private totalLines = 0;
  private totalBytes = 0;
  private rootCandidate: string | null = null;
  private rootShared = true;

  /** Per-file rows are only kept when the project actually stores them. */
  constructor(private readonly keepFiles: boolean) {}

  /**
   * Decides whether a path is worth reading, and how.
   *
   * Cheap, so it runs before a single byte is decompressed — which is why an
   * excluded `node_modules` costs nothing but its directory entry.
   */
  shouldRead(rawPath: string): { path: string; captureLimit: number } | null {
    const path = normalizePath(rawPath);
    if (!path) return null;

    // Before the exclusion check: a lockfile is excluded from every count and
    // is still the answer to "does this project have one".
    this.hygiene.observeRaw(path);

    if (isExcludedPath(path)) {
      this.skipped.excluded += 1;
      return null;
    }

    // An archive can legitimately hold the same path twice; keep the first.
    const hash = hashPath(path);
    if (this.seen.has(hash)) return null;
    this.seen.add(hash);

    // Config-file signals come from the path alone.
    this.tech.addPath(path);
    this.hygiene.observe(path);

    const wantsManifest =
      isManifestPath(path) || path.toLowerCase().endsWith("schema.prisma");
    const manifestRoom = MAX_RETAINED_MANIFEST_BYTES - this.manifestBytes;
    const manifestLimit =
      wantsManifest && manifestRoom > 0
        ? Math.min(MAX_MANIFEST_BYTES, manifestRoom)
        : 0;

    // A structured body is parsed and dropped inside add(), so its budget
    // limits parsing work rather than retained memory.
    const structuredLimit = this.structuredLimitFor(path);

    // .gitignore decides whether a committed .env is a real finding, and it is
    // the only file read purely for a hygiene rule.
    const wantsIgnore = path.toLowerCase().endsWith(".gitignore");

    return {
      path,
      captureLimit: Math.max(
        manifestLimit,
        structuredLimit,
        wantsIgnore ? MAX_STRUCTURED_FILE_BYTES : 0,
      ),
    };
  }

  /** Zero once either structured budget is spent, which stops the parsing. */
  private structuredLimitFor(path: string): number {
    if (!structuredKind(path)) return 0;

    if (
      this.structuredFiles >= MAX_STRUCTURED_FILES ||
      this.structuredBytes >= MAX_STRUCTURED_TOTAL_BYTES
    ) {
      this.hygiene.countStructured(false);
      return 0;
    }

    return Math.min(
      MAX_STRUCTURED_FILE_BYTES,
      MAX_STRUCTURED_TOTAL_BYTES - this.structuredBytes,
    );
  }

  add(outcome: ScanOutcome): void {
    if ("skipped" in outcome) {
      this.skipped[outcome.skipped] += 1;
      return;
    }

    const { file, captured } = outcome;
    this.totalFiles += 1;
    this.totalLines += file.lines;
    this.totalBytes += file.bytes;
    this.trackRoot(file.path);

    const running = this.languages.get(file.language) ?? {
      language: file.language,
      fileCount: 0,
      lines: 0,
      bytes: 0,
    };
    running.fileCount += 1;
    running.lines += file.lines;
    running.bytes += file.bytes;
    this.languages.set(file.language, running);

    if (this.keepFiles) this.files.push(file);

    if (!captured || captured.length === 0) return;

    // A body that stopped at its capture limit is a prefix, not a file.
    // Parsing a prefix would report a syntax error in a file that is fine —
    // the one failure mode that would make findings worth ignoring.
    const complete = captured.length === file.bytes;
    const lower = file.path.toLowerCase();

    if (complete && lower.endsWith(".gitignore")) {
      this.hygiene.setGitignore(captured.toString("utf8"));
    }

    if (structuredKind(file.path)) {
      if (complete) {
        const finding = validateStructured(file.path, captured);
        if (finding) this.findings.push(finding);
        this.structuredFiles += 1;
        this.structuredBytes += captured.length;
        this.hygiene.countStructured(true);
      } else {
        this.hygiene.countStructured(false);
      }
    }

    if (
      complete &&
      (isManifestPath(file.path) || lower.endsWith("schema.prisma"))
    ) {
      this.manifests.push({ path: file.path, content: captured });
      this.manifestBytes += captured.length;

      if (lower.endsWith("schema.prisma")) {
        this.tech.addPrismaSchema(captured.toString("utf8"));
      }
    }
  }

  get countedFiles(): number {
    return this.totalFiles;
  }

  /**
   * Mirrors stripSharedRoot's test, one file at a time.
   *
   * Findings need the same prefix stripped as file rows do, or a finding cites
   * `myproject/tsconfig.json` while the file list shows `tsconfig.json`. Since
   * file rows are only retained when the project opted into per-file tracking,
   * the root has to be tracked as files pass rather than derived from them.
   */
  private trackRoot(path: string): void {
    if (!this.rootShared) return;

    if (this.rootCandidate === null) {
      this.rootCandidate = path.split("/")[0];
    }

    const root = this.rootCandidate;
    if (
      !root ||
      !path.startsWith(`${root}/`) ||
      path.length <= root.length + 1
    ) {
      this.rootShared = false;
    }
  }

  /**
   * Finalises everything.
   *
   * The shared root is stripped here rather than up front: streaming cannot
   * know whether every path begins with the same directory until the last one
   * has arrived. Only stored file paths are affected — the counts never were.
   */
  finish(): StreamedAnalysis {
    const dependencies = scanDependencies(this.manifests);
    for (const dep of dependencies.dependencies) {
      this.tech.addDependency(dep);
    }

    // A broken package.json produces both a syntax finding and a dependency
    // problem. One file, one row: the syntax finding names the line, so it is
    // the one that survives.
    const reported = new Set(
      this.findings.map((finding) => finding.path).filter((p): p is string => !!p),
    );
    const root = this.rootShared ? this.rootCandidate : null;
    const findings = sortFindings([
      ...this.findings,
      ...manifestProblemFindings(dependencies.problems, reported),
      ...this.hygiene.finish(),
    ]).map((finding) => {
      if (!root || !finding.path?.startsWith(`${root}/`)) return finding;
      return { ...finding, path: finding.path.slice(root.length + 1) };
    });

    return {
      findings,
      analysis: {
        files: stripSharedRoot(this.files),
        languages: [...this.languages.values()].sort(
          (a, b) => b.bytes - a.bytes,
        ),
        totalFiles: this.totalFiles,
        totalLines: this.totalLines,
        totalBytes: this.totalBytes,
        skipped: { ...this.skipped },
      },
      dependencies,
      detected: this.tech.finish(),
    };
  }
}

/**
 * Drops a single wrapping directory shared by every path, so a zip of
 * `project/src/a.ts` compares against a folder upload of the same tree.
 */
export function stripSharedRoot(files: ScannedFile[]): ScannedFile[] {
  if (files.length === 0) return files;

  const root = files[0].path.split("/")[0];
  const shared =
    root &&
    files.every(
      (file) =>
        file.path.startsWith(`${root}/`) && file.path.length > root.length + 1,
    );

  if (!shared) return files;

  return files.map((file) => {
    const path = file.path.slice(root.length + 1);
    return { ...file, path, pathHash: hashPath(path) };
  });
}
