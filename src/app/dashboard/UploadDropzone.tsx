"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDropzone, type FileRejection } from "react-dropzone";
import {
  UploadProgress,
  type UploadPhase,
} from "@/components/UploadProgress";

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
  findings: Array<{
    severity: "ERROR" | "WARN" | "INFO";
    title: string;
    path: string | null;
  }>;
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
  // Strip a leading "./" as well as "/". react-dropzone reports "./a/b.ts",
  // and the server's normalizePath drops that prefix anyway — leaving it on
  // here meant the live upload log showed a path the database never stored.
  return candidate.replace(/^\.\//, "").replace(/^\/+/, "");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadDropzone({ projectId }: { projectId?: string }) {
  const router = useRouter();
  const folderInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadSummary | null>(null);
  const [projectName, setProjectName] = useState("");
  const [phase, setPhase] = useState<UploadPhase>({ kind: "idle" });

  const upload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
      // Send order, which is the order the log shows them in.
      const manifest = files.map((file) => ({
        path: relativePathOf(file),
        size: file.size,
      }));

      setBusy(true);
      setError(null);
      setResult(null);
      setPhase({
        kind: "uploading",
        sentBytes: 0,
        totalBytes,
        files: files.length,
        manifest,
      });

      try {
        const form = new FormData();
        if (!projectId && projectName.trim()) {
          form.set("projectName", projectName.trim());
        }

        const isSingleZip =
          files.length === 1 && files[0].name.toLowerCase().endsWith(".zip");

        for (const file of files) {
          // The path goes *before* its file. The server streams the request
          // in one pass, so it has to know where a file belongs by the time
          // the bytes arrive — pairing them by index afterwards would mean
          // buffering, which is what the size limits used to exist for.
          if (!isSingleZip) form.append("paths", relativePathOf(file));
          form.append("files", file, file.name);
        }

        // projectId travels in the query string so the server can look up
        // whether this project stores per-file rows without reading the body.
        const endpoint = projectId
          ? `/api/upload?projectId=${encodeURIComponent(projectId)}`
          : "/api/upload";

        // XMLHttpRequest rather than fetch: fetch cannot report how much of
        // a request body has been sent, and with no size cap an upload can run
        // for minutes. Real bytes-sent feedback matters more than tidier code.
        const { status, body } = await new Promise<{
          status: number;
          body: string;
        }>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", endpoint);

          xhr.upload.addEventListener("progress", (event) => {
            if (!event.lengthComputable) return;
            setPhase({
              kind: "uploading",
              sentBytes: event.loaded,
              totalBytes: event.total,
              files: files.length,
              manifest,
            });
          });

          // Once the body is sent the server starts counting, which has no
          // honest percentage — switch to the indeterminate phase.
          xhr.upload.addEventListener("load", () => {
            setPhase({
              kind: "analysing",
              totalBytes,
              files: files.length,
              manifest,
            });
          });

          xhr.addEventListener("load", () =>
            resolve({ status: xhr.status, body: xhr.responseText }),
          );
          xhr.addEventListener("error", () =>
            reject(new Error("network error")),
          );
          xhr.addEventListener("abort", () => reject(new Error("aborted")));

          xhr.send(form);
        });

        let payload: { error?: string } & Partial<UploadSummary>;
        try {
          payload = JSON.parse(body);
        } catch {
          setError("The server sent a response that could not be read.");
          return;
        }

        if (status < 200 || status >= 300) {
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
        setPhase({ kind: "idle" });
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

        <p className="text-sm font-medium">
          {busy
            ? "Working…"
            : isDragActive
              ? "Drop to analyse"
              : "Drop a project folder or a .zip here"}
        </p>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted">
          Any size. node_modules, build output, lockfiles and binaries are
          skipped automatically.
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

      <UploadProgress phase={phase} />

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
          {/* Errors and warnings only. The notes are worth a count but not a
              queue-jump into a success panel, and all of them are on the
              project page — these rows are stored on the snapshot now, so
              nothing here is the only copy. */}
          {result.findings.length > 0 && (
            <div className="mt-2">
              <ul className="space-y-0.5">
                {result.findings
                  .filter((finding) => finding.severity !== "INFO")
                  .slice(0, 4)
                  .map((finding, index) => (
                    <li
                      key={`${finding.title}-${finding.path ?? index}`}
                      style={{
                        color:
                          finding.severity === "ERROR"
                            ? "var(--color-sev-error)"
                            : "var(--color-sev-warn)",
                      }}
                    >
                      {finding.title}
                      {finding.path && ` — ${finding.path}`}
                    </li>
                  ))}
              </ul>
              <p className="mt-1 text-faint">
                {result.findings.length}{" "}
                {result.findings.length === 1 ? "finding" : "findings"} in all,
                listed on the project page.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
