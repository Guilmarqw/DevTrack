import { detectLanguage, hashPath, type AnalysisResult, type RawEntry } from "./analyze";
import { isExcludedPath, normalizePath } from "./exclude";
import {
  isManifestPath,
  MAX_MANIFEST_BYTES,
  scanDependencies,
  type DependencyScan,
} from "./dependencies";
import { TechCollector, type DetectedTech } from "./tech";

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
  private manifestBytes = 0;
  private totalFiles = 0;
  private totalLines = 0;
  private totalBytes = 0;

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

    if (isExcludedPath(path)) {
      this.skipped.excluded += 1;
      return null;
    }

    // An archive can legitimately hold the same path twice; keep the first.
    const hash = hashPath(path);
    if (this.seen.has(hash)) return null;
    this.seen.add(hash);

    // Temporary: set DEVTRACK_MEM=1 to trace where memory goes during a very
    // large upload. Distinguishes JS object retention (heapUsed) from retained
    // Buffers (external / arrayBuffers).
    if (process.env.DEVTRACK_MEM && this.seen.size % 5000 === 0) {
      const m = process.memoryUsage();
      const mb = (n: number) => Math.round(n / 1048576);
      console.log(
        `[mem] files=${this.seen.size} heapUsed=${mb(m.heapUsed)}MB ` +
          `heapTotal=${mb(m.heapTotal)}MB external=${mb(m.external)}MB ` +
          `arrayBuffers=${mb(m.arrayBuffers)}MB rss=${mb(m.rss)}MB`,
      );
    }

    // Config-file signals come from the path alone.
    this.tech.addPath(path);

    const wantsBody =
      isManifestPath(path) || path.toLowerCase().endsWith("schema.prisma");
    const room = MAX_RETAINED_MANIFEST_BYTES - this.manifestBytes;

    return {
      path,
      captureLimit:
        wantsBody && room > 0 ? Math.min(MAX_MANIFEST_BYTES, room) : 0,
    };
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

    if (captured && captured.length > 0) {
      this.manifests.push({ path: file.path, content: captured });
      this.manifestBytes += captured.length;

      if (file.path.toLowerCase().endsWith("schema.prisma")) {
        this.tech.addPrismaSchema(captured.toString("utf8"));
      }
    }
  }

  get countedFiles(): number {
    return this.totalFiles;
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

    return {
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
