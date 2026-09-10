"use server";

import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation";

export type SettingsState = { error: string | null; ok: string | null };

/** Actions are unbound and read their own ids from the session, never the body. */
export async function updateProfile(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();

  if (name.length > 191) {
    return { error: "That name is too long.", ok: null };
  }

  await db.user.update({
    where: { id: user.id },
    // An empty field means "no display name", which the UI falls back from.
    data: { name: name || null },
  });

  return { error: null, ok: "Display name saved." };
}

export async function changePassword(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await requireUser();

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!current || !next) {
    return { error: "Fill in both password fields.", ok: null };
  }
  if (next !== confirm) {
    return { error: "The new passwords do not match.", ok: null };
  }
  if (next.length < PASSWORD_MIN_LENGTH) {
    return {
      error: `New password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
      ok: null,
    };
  }
  // bcrypt silently truncates past 72 bytes, so reject rather than mislead.
  if (Buffer.byteLength(next, "utf8") > 72) {
    return { error: "New password must be 72 bytes or fewer.", ok: null };
  }
  if (next === current) {
    return { error: "That is already your password.", ok: null };
  }

  const record = await db.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!record) return { error: "That account no longer exists.", ok: null };

  // Requiring the current password is what stops a borrowed session from
  // locking the owner out of their own account.
  const matches = await bcrypt.compare(current, record.passwordHash);
  if (!matches) {
    return { error: "That is not your current password.", ok: null };
  }

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(next, 10) },
  });

  return {
    error: null,
    // The session is a JWT that does not carry the hash, so it stays valid.
    ok: "Password changed. Existing sessions stay signed in.",
  };
}

export async function setLeaderboardVisibility(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await requireUser();
  // An unchecked checkbox sends nothing at all, which is the "off" signal.
  const show = formData.get("showOnLeaderboard") === "on";

  await db.user.update({
    where: { id: user.id },
    data: { showOnLeaderboard: show },
  });

  return {
    error: null,
    ok: show
      ? "You appear on the leaderboard."
      : "You are hidden from the leaderboard.",
  };
}
