// What never counts. Kept in one place because the exclusion list is the single
// biggest lever on whether the numbers mean anything: leave node_modules in and
// every project is 95% JavaScript.

/** Directory names dropped wherever they appear in a path. */
export const EXCLUDED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".cache",
  ".parcel-cache",
  "dist",
  "build",
  "out",
  "coverage",
  "vendor",
  "target",
  "bin",
  "obj",
  "__pycache__",
  ".venv",
  "venv",
  "env",
  ".tox",
  ".mypy_cache",
  ".pytest_cache",
  ".idea",
  ".vscode",
  ".gradle",
  "Pods",
  ".terraform",
  // DevTrack's own generated Prisma client.
  "generated",
]);

/** Exact filenames dropped: lockfiles and other machine-written manifests. */
export const EXCLUDED_FILENAMES = new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "bun.lock",
  "composer.lock",
  "gemfile.lock",
  "poetry.lock",
  "pdm.lock",
  "cargo.lock",
  "go.sum",
  "packages.lock.json",
  "pipfile.lock",
  ".ds_store",
  "thumbs.db",
]);

/** Suffix patterns dropped: build artefacts and anything not hand-written. */
const EXCLUDED_SUFFIXES = [
  ".min.js",
  ".min.css",
  ".map",
  ".bundle.js",
  ".chunk.js",
  ".d.ts.map",
  ".tsbuildinfo",
  ".pyc",
  ".pyo",
  ".class",
  ".o",
  ".obj",
  ".a",
  ".lib",
  ".so",
  ".dylib",
  ".dll",
  ".exe",
  ".wasm",
  ".jar",
  ".war",
  ".zip",
  ".tar",
  ".gz",
  ".bz2",
  ".xz",
  ".7z",
  ".rar",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
  ".ico",
  ".webp",
  ".avif",
  ".tiff",
  ".svgz",
  ".mp3",
  ".mp4",
  ".wav",
  ".ogg",
  ".webm",
  ".mov",
  ".avi",
  ".mkv",
  ".flac",
  ".pdf",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".db",
  ".sqlite",
  ".sqlite3",
  ".mdb",
  ".pdb",
  ".bin",
  ".dat",
  ".iso",
  ".dmg",
];

/**
 * True when a repo-relative path should not be counted. Paths arrive with
 * forward slashes; see normalizePath.
 */
export function isExcludedPath(relativePath: string): boolean {
  const segments = relativePath.split("/");
  const filename = segments[segments.length - 1] ?? "";
  const lowerName = filename.toLowerCase();

  // Any excluded directory anywhere in the path kills the file. Checking every
  // segment (not just the first) is what catches a nested node_modules.
  for (const segment of segments.slice(0, -1)) {
    if (EXCLUDED_DIRECTORIES.has(segment)) return true;
  }

  if (EXCLUDED_FILENAMES.has(lowerName)) return true;
  if (EXCLUDED_SUFFIXES.some((suffix) => lowerName.endsWith(suffix))) {
    return true;
  }

  return false;
}

/**
 * Windows and zip archives disagree about separators, and browsers hand over
 * paths with a leading "./" or the drop folder's own name. Normalise to
 * forward slashes with no leading slash.
 */
export function normalizePath(input: string): string {
  return input
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .trim();
}

const BINARY_SNIFF_BYTES = 8192;

/**
 * A NUL byte in the first 8 KB means binary. Cheap, and it is what git itself
 * does — it catches unknown binary formats that the suffix list misses.
 */
export function looksBinary(content: Buffer): boolean {
  const limit = Math.min(content.length, BINARY_SNIFF_BYTES);
  for (let i = 0; i < limit; i += 1) {
    if (content[i] === 0) return true;
  }
  return false;
}
