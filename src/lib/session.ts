import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import type { Role } from "@/generated/prisma/enums";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
};

/**
 * The session as the server sees it, or null. Reads the signed cookie — no
 * database round trip.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  return {
    id: session.user.id,
    email: session.user.email ?? "",
    name: session.user.name ?? null,
    role: session.user.role,
  };
}

/**
 * Real authorization boundary. `proxy.ts` only does a cheap cookie check for
 * redirect UX, so every protected page and route handler must call this — it
 * is what actually verifies the token signature.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/dashboard");
  return user;
}

/**
 * Scope clause for any project query. An admin sees everything; everyone else
 * sees only what they own. There is no sharing model by design.
 */
export function projectScope(user: SessionUser) {
  return user.role === "ADMIN" ? {} : { ownerId: user.id };
}
