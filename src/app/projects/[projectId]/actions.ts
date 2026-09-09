"use server";

import { db } from "@/lib/db";
import { requireUser, projectScope } from "@/lib/session";
import { clampPercent } from "@/lib/completion";
import type { TaskStatus } from "@/generated/prisma/enums";

export type TaskActionState = { error: string | null };

/**
 * Every action funnels through here. A standard user gets "not found" for
 * someone else's project rather than a permission error, so ids cannot be
 * probed; an admin passes the same check with an empty scope.
 */
async function authorizeProject(projectId: string) {
  const user = await requireUser();
  const project = await db.project.findFirst({
    where: { id: projectId, ...projectScope(user) },
    select: { id: true, name: true },
  });
  if (!project) return null;
  return { user, project };
}

/**
 * `projectId` arrives in the form body rather than through `.bind()`.
 *
 * Not a style choice: on Next 16.3.4 a bound server action passed to
 * `useActionState` never closes its response on the no-JS form-POST path — the
 * write lands and the request then hangs until the client gives up. A bound
 * action on a plain `<form action={...}>` is fine, and so is an unbound action
 * in `useActionState`; only the combination breaks. The id is not a secret and
 * `authorizeProject` still checks it, so nothing is weakened by reading it
 * from the body.
 */
export async function createTask(
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const projectId = String(formData.get("projectId") ?? "");
  const auth = await authorizeProject(projectId);
  if (!auth) return { error: "That project does not exist." };

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "A task needs a title." };
  if (title.length > 191) return { error: "That title is too long." };

  const rawWeight = Number(formData.get("weight") ?? 1);
  const weight =
    Number.isFinite(rawWeight) && rawWeight >= 1 && rawWeight <= 100
      ? Math.floor(rawWeight)
      : 1;

  await db.$transaction([
    db.task.create({
      data: { projectId, title, weight, createdById: auth.user.id },
    }),
    db.activityLogEntry.create({
      data: {
        projectId,
        actorId: auth.user.id,
        type: "TASK_CREATED",
        summary: `Added task “${title}”`,
      },
    }),
  ]);

  return { error: null };
}

/** Cycles TODO → IN_PROGRESS → DONE → TODO. */
export async function cycleTaskStatus(projectId: string, taskId: string) {
  const auth = await authorizeProject(projectId);
  if (!auth) return;

  const task = await db.task.findFirst({
    where: { id: taskId, projectId },
    select: { id: true, title: true, status: true },
  });
  if (!task) return;

  const next: Record<TaskStatus, TaskStatus> = {
    TODO: "IN_PROGRESS",
    IN_PROGRESS: "DONE",
    DONE: "TODO",
  };
  const status = next[task.status];

  await db.$transaction([
    db.task.update({
      where: { id: task.id },
      data: {
        status,
        // completedAt is the timestamp the spec asks tasks to be tied to, so
        // it is set on the way into DONE and cleared on the way back out.
        completedAt: status === "DONE" ? new Date() : null,
      },
    }),
    db.activityLogEntry.create({
      data: {
        projectId,
        actorId: auth.user.id,
        type: status === "DONE" ? "TASK_COMPLETED" : "TASK_UPDATED",
        summary:
          status === "DONE"
            ? `Completed “${task.title}”`
            : `Moved “${task.title}” to ${status === "IN_PROGRESS" ? "in progress" : "to do"}`,
        metadata: { taskId: task.id, from: task.status, to: status },
      },
    }),
  ]);

}

export async function deleteTask(projectId: string, taskId: string) {
  const auth = await authorizeProject(projectId);
  if (!auth) return;

  const task = await db.task.findFirst({
    where: { id: taskId, projectId },
    select: { id: true, title: true },
  });
  if (!task) return;

  await db.$transaction([
    db.task.delete({ where: { id: task.id } }),
    db.activityLogEntry.create({
      data: {
        projectId,
        actorId: auth.user.id,
        type: "TASK_DELETED",
        summary: `Deleted task “${task.title}”`,
      },
    }),
  ]);

}

/** Unbound for the same reason as createTask — see the note there. */
export async function setCompletionTarget(
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const projectId = String(formData.get("projectId") ?? "");
  const auth = await authorizeProject(projectId);
  if (!auth) return { error: "That project does not exist." };

  const mode = String(formData.get("mode") ?? "");
  if (mode !== "TASKS" && mode !== "MANUAL") {
    return { error: "Pick either task-derived or manual completion." };
  }

  const manual = clampPercent(Math.round(Number(formData.get("manual") ?? 0)));

  await db.$transaction([
    db.project.update({
      where: { id: projectId },
      data: { completionMode: mode, manualCompletionPct: manual },
    }),
    db.activityLogEntry.create({
      data: {
        projectId,
        actorId: auth.user.id,
        type: "COMPLETION_TARGET_CHANGED",
        summary:
          mode === "MANUAL"
            ? `Set completion manually to ${manual}%`
            : "Switched completion to task-derived",
      },
    }),
  ]);

  return { error: null };
}

export async function setTrackFiles(projectId: string, trackFiles: boolean) {
  const auth = await authorizeProject(projectId);
  if (!auth) return;

  await db.project.update({
    where: { id: projectId },
    data: { trackFiles },
  });

}
