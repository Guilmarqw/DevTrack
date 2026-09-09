"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { TaskStatus } from "@/generated/prisma/enums";
import {
  createTask,
  cycleTaskStatus,
  deleteTask,
  type TaskActionState,
} from "./actions";

type Task = {
  id: string;
  title: string;
  status: TaskStatus;
  weight: number;
  completedAt: Date | null;
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

// Status is state, not identity, so these come from the reserved status
// palette rather than a categorical slot — and each ships with its label, so
// the colour never carries the meaning alone.
const STATUS_DOT: Record<TaskStatus, string> = {
  TODO: "var(--color-faint)",
  IN_PROGRESS: "#fab219",
  DONE: "#0ca30c",
};

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {pending ? "Adding…" : "Add"}
    </button>
  );
}

export function TaskList({
  projectId,
  tasks,
}: {
  projectId: string;
  tasks: Task[];
}) {
  const [state, formAction] = useActionState<TaskActionState, FormData>(
    createTask,
    { error: null },
  );

  const done = tasks.filter((t) => t.status === "DONE").length;

  return (
    <div>
      <form action={formAction} className="flex items-end gap-2">
        {/* Carries the id instead of .bind() — see the note on createTask. */}
        <input type="hidden" name="projectId" value={projectId} />
        <div className="flex-1">
          <label htmlFor="title" className="block text-xs font-medium text-muted">
            New task
          </label>
          <input
            id="title"
            name="title"
            required
            maxLength={191}
            placeholder="Ship the upload pipeline"
            className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm outline-none placeholder:text-faint focus:border-accent"
          />
        </div>
        <div className="w-16">
          <label htmlFor="weight" className="block text-xs font-medium text-muted">
            Weight
          </label>
          <input
            id="weight"
            name="weight"
            type="number"
            min={1}
            max={100}
            defaultValue={1}
            className="tabular mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent"
          />
        </div>
        <AddButton />
      </form>

      {state.error && (
        <p role="alert" className="mt-2 text-xs text-muted">
          {state.error}
        </p>
      )}

      {tasks.length === 0 ? (
        <div className="mt-4 rounded-lg border border-line bg-surface px-4 py-8 text-center">
          <p className="text-sm font-medium">No tasks yet</p>
          <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted">
            Add milestones here and this project&rsquo;s completion percentage
            will track them. Give a milestone a higher weight to make it count
            for more.
          </p>
        </div>
      ) : (
        <>
          <p className="mt-4 text-xs text-faint">
            {done} of {tasks.length} done
          </p>
          <ul className="mt-2 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {tasks.map((task) => (
              <li key={task.id} className="flex items-center gap-3 px-3 py-2">
                <form action={cycleTaskStatus.bind(null, projectId, task.id)}>
                  <button
                    type="submit"
                    title="Cycle status"
                    className="flex items-center gap-2 text-left"
                  >
                    <span
                      aria-hidden
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: STATUS_DOT[task.status] }}
                    />
                    <span className="text-xs text-muted">
                      {STATUS_LABEL[task.status]}
                    </span>
                  </button>
                </form>

                <span
                  className={`flex-1 text-sm ${
                    task.status === "DONE" ? "text-muted line-through" : ""
                  }`}
                >
                  {task.title}
                </span>

                {task.weight > 1 && (
                  <span className="tabular text-xs text-faint">
                    ×{task.weight}
                  </span>
                )}

                <form action={deleteTask.bind(null, projectId, task.id)}>
                  <button
                    type="submit"
                    className="text-xs text-faint transition-colors hover:text-accent"
                    title="Delete task"
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
