"use client";

import { useActionState, useState } from "react";
import { deleteProject } from "./actions";

/**
 * Two-step delete.
 *
 * The first click reveals what will actually be destroyed with real counts;
 * only the second click submits. A single-click delete would be wrong here
 * because the loss is total and permanent — DevTrack never kept the source, so
 * there is nothing to reconstruct the history from, and re-uploading the same
 * folder starts a new project at zero.
 *
 * A typed-name confirmation was considered and rejected as disproportionate
 * for a local single-user tool; the counts do the work of making the
 * consequence concrete. The server checks the confirm field regardless, so the
 * gate is not purely visual.
 *
 * The action is unbound with the id in a hidden input — a `.bind()`-ed action
 * in `useActionState` hangs the no-JS POST path on Next 16.3.4, and
 * `authorizeProject` re-checks the id anyway.
 */
export function DeleteProject({
  projectId,
  projectName,
  counts,
}: {
  projectId: string;
  projectName: string;
  counts: { snapshots: number; tasks: number; findings: number };
}) {
  const [armed, setArmed] = useState(false);
  const [state, action, pending] = useActionState(deleteProject, {
    error: null,
  });

  if (!armed) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setArmed(true)}
          className="press rounded-md border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:border-current"
          style={{ color: "var(--color-sev-error)" }}
        >
          Delete project
        </button>
        {state.error && (
          <p
            className="mt-2 text-xs"
            style={{ color: "var(--color-sev-error)" }}
          >
            {state.error}
          </p>
        )}
      </div>
    );
  }

  const lost = [
    `${counts.snapshots} ${counts.snapshots === 1 ? "snapshot" : "snapshots"}`,
    `${counts.tasks} ${counts.tasks === 1 ? "task" : "tasks"}`,
    `${counts.findings} ${counts.findings === 1 ? "finding" : "findings"}`,
  ].join(", ");

  return (
    <div
      className="rise rounded-lg border bg-surface px-4 py-3"
      style={{ borderColor: "var(--color-sev-error)" }}
    >
      <p className="text-sm font-medium">Delete “{projectName}” permanently?</p>
      <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted">
        This removes {lost} and the entire activity history for this project.
        None of it can be recovered — DevTrack never stored your source, so
        there is nothing to rebuild it from. Uploading the folder again would
        create a new project with no history.
      </p>

      <form action={action} className="mt-3 flex flex-wrap items-center gap-2">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="confirm" value="delete" />
        <button
          type="submit"
          disabled={pending}
          className="press rounded-md px-3 py-1.5 text-xs font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{ backgroundColor: "var(--color-sev-error)" }}
        >
          {pending ? "Deleting…" : "Yes, delete permanently"}
        </button>
        <button
          type="button"
          onClick={() => setArmed(false)}
          disabled={pending}
          className="press rounded-md border border-line px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-ink disabled:opacity-60"
        >
          Keep it
        </button>
      </form>

      {state.error && (
        <p className="mt-2 text-xs" style={{ color: "var(--color-sev-error)" }}>
          {state.error}
        </p>
      )}
    </div>
  );
}
