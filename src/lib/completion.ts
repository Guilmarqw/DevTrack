import type { CompletionMode, TaskStatus } from "@/generated/prisma/enums";

export type CompletionInput = {
  completionMode: CompletionMode;
  manualCompletionPct: number;
};

export type TaskWeight = { status: TaskStatus; weight: number };

/**
 * A project's completion percentage, 0-100.
 *
 * In TASKS mode it is weighted: a milestone with weight 5 moves the number
 * five times as far as a chore with weight 1. A project with no tasks is 0
 * rather than 100 — nothing done out of nothing is not "finished".
 */
export function computeCompletion(
  project: CompletionInput,
  tasks: TaskWeight[],
): number {
  if (project.completionMode === "MANUAL") {
    return clampPercent(project.manualCompletionPct);
  }

  // Guard against a zero or negative weight making the total zero or flipping
  // the ratio; weight is user-editable.
  const totalWeight = tasks.reduce((sum, t) => sum + Math.max(1, t.weight), 0);
  if (totalWeight === 0) return 0;

  const doneWeight = tasks
    .filter((t) => t.status === "DONE")
    .reduce((sum, t) => sum + Math.max(1, t.weight), 0);

  return clampPercent((doneWeight / totalWeight) * 100);
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}
