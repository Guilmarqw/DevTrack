"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDropzone, type FileRejection } from "react-dropzone";

type UploadSummary = {
  projectId: string;
  projectName: string;
  isNewProject: boolean;
  totalFiles: number;
  totalLines: number;
  totalBytes: number;
  languages: Array<{ language: string; bytes: number }>;
  skipped: { excluded: number; binary: number; empty: number };
  dependencyCount: number;
  detectedTech: string[];
  manifestProblems: Array<{ path: string; reason: string }>;
};

/**
 * The browser exposes a dropped file's location in one of three places
 * depending on how it was chosen. react-dropzone sets `path` when a directory
 * is dropped; a <input webkitdirectory> picker sets `webkitRelativePath`; a
 * plain file picker gives neither.
 */
function relativePathOf(file: File): string {
  const withPath = file as File & { path?: string };
  const candidate = withPath.path || file.webkitRelativePath || file.name;
  return candidate.replace(/^\/+/, "");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Mirrors the server's limits in src/lib/upload/zip.ts. Checked here too so a
// 300 MB folder is refused instantly instead of after uploading all of it.
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
const MAX_FILES = 50_000;

export function UploadDropzone({ projectId }: { projectId?: string }) {
  const router = useRouter();
  const folderInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadSummary | null>(null);
  const [projectName, setProjectName] = useState("");
  // What is being worked on, so "Analysing…" can say how much.
  const [progress, setProgress] = useState<{
    files: number;
    bytes: number;
  } | null>(null);

  const upload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      // Refuse before spending time on the wire, and say what the limit is
      // rather than just "too big".
      if (files.length > MAX_FILES) {
        setError(
          `That folder has ${files.length.toLocaleString()} files. The limit is ${MAX_FILES.toLocaleString()}.`,
        );
        return;
      }
      const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
      if (totalBytes > MAX_TOTAL_BYTES) {
        setError(
          `That upload is ${formatBytes(totalBytes)}. The limit is 256 MB — check that a build folder is not being included.`,
        );
        return;
      }

      setBusy(true);
      setError(null);
      setResult(null);
      setProgress({ files: files.length, bytes: totalBytes });

      try {
        const form = new FormData();
        if (projectId) form.set("projectId", projectId);
        else if (projectName.trim()) form.set("projectName", projectName.trim());

        const isSingleZip =
          files.length === 1 && files[0].name.toLowerCase().endsWith(".zip");

        for (const file of files) {
          form.append("files", file, file.name);
          // The server pairs these by index; a zip carries no tree of its own.
          if (!isSingleZip) form.append("paths", relativePathOf(file));
        }

        const response = await fetch("/api/upload", {
          method: "POST",
          body: form,
        });

        const payload = await response.json();

        if (!response.ok) {
          setError(payload.error ?? "That upload failed.");
          return;
        }

        setResult(payload as UploadSummary);
        setProjectName("");
        // Pull the server components again so counts and feeds update.
        router.refresh();
      } catch {
        setError("Could not reach the server. Is the dev server still running?");
      } finally {
        setBusy(false);
        setProgress(null);
      }
    },
    [projectId, projectName, router],
  );

  const onDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      if (accepted.length === 0 && rejected.length > 0) {
        setError("Those files were not accepted.");
        return;
      }
      void upload(accepted);
    },
    [upload],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
    multiple: true,
    disabled: busy,
  });

  return (
    <div>
      {!projectId && (
        <div className="mb-3">
          <label htmlFor="projectName" className="block text-xs font-medium text-muted">
            Project name <span className="text-faint">(optional)</span>
          </label>
          <input
            id="projectName"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            placeholder="Defaults to the folder or archive name"
            disabled={busy}
            className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm placeholder:text-faint focus:border-accent disabled:opacity-50"
          />
        </div>
      )}

      <div
        {...getRootProps()}
        className={`rounded-lg border border-dashed px-6 py-10 text-center transition-colors ${
          isDragActive ? "border-accent bg-accent-soft" : "border-line bg-surface"
        } ${busy ? "opacity-60" : ""}`}
      >
        <input {...getInputProps()} />

        <p className="text-sm font-medium" role={busy ? "status" : undefined}>
          {busy
            ? "Analysing…"
            : isDragActive
              ? "Drop to analyse"
              : "Drop a project folder or a .zip here"}
        </p>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted">
          {busy && progress
            ? `${progress.files.toLocaleString()} ${progress.files === 1 ? "file" : "files"} · ${formatBytes(progress.bytes)} — counting lines and reading manifests.`
            : "node_modules, build output, lockfiles and binaries are skipped automatically."}
        </p>

        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => folderInput.current?.click()}
            disabled={busy}
            className="rounded-md border border-line px-3 py-1.5 text-xs transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            Choose folder
          </button>
          <button
            type="button"
            onClick={() => zipInput.current?.click()}
            disabled={busy}
            className="rounded-md border border-line px-3 py-1.5 text-xs transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            Choose .zip
          </button>
        </div>

        {/* Clicking the dropzone opens a file picker, which cannot select a
            directory. These two inputs are the explicit pickers. */}
        <input
          ref={folderInput}
          type="file"
          hidden
          multiple
          // Non-standard but universally supported, and React does not know it.
          {...{ webkitdirectory: "" }}
          onChange={(event) => {
            void upload(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
        <input
          ref={zipInput}
          type="file"
          hidden
          accept=".zip,application/zip"
          onChange={(event) => {
            void upload(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-md border border-line bg-accent-soft px-3 py-2 text-xs"
        >
          {error}
        </p>
      )}

      {result && (
        <div className="mt-3 rounded-md border border-line bg-surface px-4 py-3 text-xs">
          <p className="text-sm font-medium">
            {result.isNewProject ? "Created" : "Re-scanned"} {result.projectName}
          </p>
          <p className="mt-1 text-muted">
            {result.totalFiles.toLocaleString()} files ·{" "}
            {result.totalLines.toLocaleString()} lines ·{" "}
            {formatBytes(result.totalBytes)}
          </p>
          {result.languages.length > 0 && (
            <p className="mt-1 text-muted">
              {result.languages
                .slice(0, 4)
                .map((l) => l.language)
                .join(", ")}
              {result.languages.length > 4 &&
                ` +${result.languages.length - 4} more`}
            </p>
          )}
          {(result.dependencyCount > 0 || result.detectedTech.length > 0) && (
            <p className="mt-1 text-muted">
              {result.dependencyCount} dependencies
              {result.detectedTech.length > 0 && (
                <>
                  {" · "}
                  {result.detectedTech.slice(0, 4).join(", ")}
                  {result.detectedTech.length > 4 &&
                    ` +${result.detectedTech.length - 4} more`}
                </>
              )}
            </p>
          )}
          <p className="mt-1 text-faint">
            Skipped {result.skipped.excluded} excluded,{" "}
            {result.skipped.binary} binary, {result.skipped.empty} empty
          </p>
          {result.manifestProblems.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {/* A manifest that failed to parse is reported rather than
                  silently contributing nothing — usually it is a real syntax
                  error in the file. */}
              {result.manifestProblems.map((problem) => (
                <li key={problem.path} className="text-muted">
                  Could not read {problem.path} — {problem.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
