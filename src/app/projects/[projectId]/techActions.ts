"use server";

import { db } from "@/lib/db";
import { requireUser, projectScope } from "@/lib/session";
import type { TechCategory } from "@/generated/prisma/enums";

export type TechActionState = { error: string | null };

const CATEGORIES: TechCategory[] = [
  "FRONTEND",
  "BACKEND",
  "DATABASE",
  "OTHER",
];

async function authorizeProject(projectId: string) {
  const user = await requireUser();
  const project = await db.project.findFirst({
    where: { id: projectId, ...projectScope(user) },
    select: { id: true },
  });
  if (!project) return null;
  return user;
}

async function logTagChange(
  projectId: string,
  actorId: string,
  summary: string,
) {
  await db.activityLogEntry.create({
    data: { projectId, actorId, type: "TECH_TAGS_UPDATED", summary },
  });
}

/**
 * Accepts a suggestion. Promoting it to MANUAL is what makes it stick: the
 * re-scan reconciler never touches a MANUAL tag, so a confirmed technology
 * survives even if the giveaway dependency is later removed.
 */
export async function confirmTechTag(projectId: string, tagId: string) {
  const user = await authorizeProject(projectId);
  if (!user) return;

  const tag = await db.techTag.findFirst({
    where: { id: tagId, projectId },
    select: { id: true, name: true },
  });
  if (!tag) return;

  await db.techTag.update({
    where: { id: tag.id },
    data: { origin: "MANUAL", dismissedAt: null },
  });
  await logTagChange(projectId, user.id, `Confirmed ${tag.name}`);
}

/**
 * Rejects a suggestion. The row is kept with a dismissal timestamp rather than
 * deleted, so the next re-scan does not detect and re-add it.
 */
export async function dismissTechTag(projectId: string, tagId: string) {
  const user = await authorizeProject(projectId);
  if (!user) return;

  const tag = await db.techTag.findFirst({
    where: { id: tagId, projectId },
    select: { id: true, name: true },
  });
  if (!tag) return;

  await db.techTag.update({
    where: { id: tag.id },
    data: { dismissedAt: new Date() },
  });
  await logTagChange(projectId, user.id, `Dismissed ${tag.name}`);
}

export async function restoreTechTag(projectId: string, tagId: string) {
  const user = await authorizeProject(projectId);
  if (!user) return;

  const tag = await db.techTag.findFirst({
    where: { id: tagId, projectId },
    select: { id: true, name: true },
  });
  if (!tag) return;

  await db.techTag.update({
    where: { id: tag.id },
    data: { dismissedAt: null, origin: "MANUAL" },
  });
  await logTagChange(projectId, user.id, `Restored ${tag.name}`);
}

/** Unbound and reading its ids from the body — see the note on createTask. */
export async function addTechTag(
  _prev: TechActionState,
  formData: FormData,
): Promise<TechActionState> {
  const projectId = String(formData.get("projectId") ?? "");
  const user = await authorizeProject(projectId);
  if (!user) return { error: "That project does not exist." };

  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "");

  if (!name) return { error: "Give the technology a name." };
  if (name.length > 191) return { error: "That name is too long." };
  if (!CATEGORIES.includes(category as TechCategory)) {
    return { error: "Pick a category." };
  }

  const existing = await db.techTag.findFirst({
    where: { projectId, category: category as TechCategory, name },
    select: { id: true, dismissedAt: true },
  });

  if (existing) {
    // Adding something previously dismissed is a reversal, so un-dismiss it
    // rather than reporting a duplicate the owner cannot see.
    await db.techTag.update({
      where: { id: existing.id },
      data: { origin: "MANUAL", dismissedAt: null },
    });
    await logTagChange(projectId, user.id, `Added ${name}`);
    return { error: null };
  }

  await db.techTag.create({
    data: {
      projectId,
      name,
      category: category as TechCategory,
      origin: "MANUAL",
    },
  });
  await logTagChange(projectId, user.id, `Added ${name}`);
  return { error: null };
}

export async function deleteTechTag(projectId: string, tagId: string) {
  const user = await authorizeProject(projectId);
  if (!user) return;

  const tag = await db.techTag.findFirst({
    where: { id: tagId, projectId },
    select: { id: true, name: true },
  });
  if (!tag) return;

  await db.techTag.delete({ where: { id: tag.id } });
  await logTagChange(projectId, user.id, `Removed ${tag.name}`);
}
