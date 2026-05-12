import "server-only";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export class AdminGuardError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "AdminGuardError";
  }
}

/** Returns the current session if the caller is ADMIN; throws otherwise. */
export async function requireAdmin() {
  const session = await auth();
  if (!session?.user) throw new AdminGuardError(401, "Sign in required.");
  if (session.user.role !== "ADMIN") throw new AdminGuardError(403, "Admin only.");
  return session;
}

/**
 * Prevents demoting / deleting the last ADMIN account. Returns the number of admins
 * (including the target) — call sites should refuse the action when the target
 * is currently ADMIN and the count is 1.
 */
export async function adminCount() {
  return prisma.user.count({ where: { role: "ADMIN" } });
}
