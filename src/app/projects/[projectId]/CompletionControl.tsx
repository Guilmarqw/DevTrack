"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { CompletionMode } from "@/generated/prisma/enums";
import { setCompletionTarget, type TaskActionState } from "./actions";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border border-line px-3 py-1.5 text-xs transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
    >
      {pending ? "Saving…" : "Save"}
    </button>
  );
}

export function CompletionControl({
  projectId,
  mode,
  manualPct,
}: {
  projectId: string;
  mode: CompletionMode;
  manualPct: number;
}) {
  const [state, formAction] = useActionState<TaskActionState, FormData>(
    setCompletionTarget,
    { error: null },
  );
  // Local mirror so the number input can disable itself immediately, before
  // the server round trip.
  const [selected, setSelected] = useState<CompletionMode>(mode);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="projectId" value={projectId} />
      <fieldset>
        <legend className="text-xs font-medium text-muted">
          Completion source
        </legend>
        <div className="mt-1 flex gap-3">
          {(["TASKS", "MANUAL"] as const).map((option) => (
            <label key={option} className="flex items-center gap-1.5 text-xs">
              <input
                type="radio"
                name="mode"
                value={option}
                checked={selected === option}
                onChange={() => setSelected(option)}
                className="accent-accent"
              />
              {option === "TASKS" ? "From tasks" : "Manual"}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="w-24">
        <label htmlFor="manual" className="block text-xs font-medium text-muted">
          Manual %
        </label>
        <input
          id="manual"
          name="manual"
          type="number"
          min={0}
          max={100}
          defaultValue={manualPct}
          disabled={selected !== "MANUAL"}
          className="tabular mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent disabled:opacity-50"
        />
      </div>

      <SaveButton />

      {state.error && (
        <p role="alert" className="text-xs text-muted">
          {state.error}
        </p>
      )}
    </form>
  );
}
