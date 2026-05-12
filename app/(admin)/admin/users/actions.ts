"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { adminCount, AdminGuardError, requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { Role } from "@/app/generated/prisma/enums";

export type ActionResult = { ok: true } | { ok: false; error: string };

const idSchema = z.string().min(1);
const roleSchema = z.enum(["ADMIN", "VENDOR", "CUSTOMER"]);

async function guard() {
  try {
    return await requireAdmin();
  } catch (err) {
    if (err instanceof AdminGuardError) throw err;
    throw err;
  }
}

export async function changeRole(formData: FormData): Promise<ActionResult> {
  const session = await guard();

  const id = idSchema.safeParse(formData.get("id"));
  const role = roleSchema.safeParse(formData.get("role"));
  if (!id.success || !role.success) return { ok: false, error: "Invalid payload." };

  if (id.data === session.user.id) {
    return { ok: false, error: "You can't change your own role." };
  }

  const target = await prisma.user.findUnique({
    where: { id: id.data },
    select: { id: true, role: true },
  });
  if (!target) return { ok: false, error: "User not found." };
  if (target.role === role.data) return { ok: true };

  if (target.role === Role.ADMIN && role.data !== Role.ADMIN) {
    const count = await adminCount();
    if (count <= 1) return { ok: false, error: "Can't demote the last admin." };
  }

  await prisma.user.update({
    where: { id: id.data },
    data: { role: role.data },
  });
  revalidatePath("/admin/users");
  revalidatePath("/admin");
  return { ok: true };
}

export async function toggleSuspend(formData: FormData): Promise<ActionResult> {
  const session = await guard();

  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { ok: false, error: "Invalid payload." };

  if (id.data === session.user.id) {
    return { ok: false, error: "You can't suspend yourself." };
  }

  const target = await prisma.user.findUnique({
    where: { id: id.data },
    select: { id: true, role: true, suspendedAt: true },
  });
  if (!target) return { ok: false, error: "User not found." };

  if (!target.suspendedAt && target.role === Role.ADMIN) {
    const count = await adminCount();
    if (count <= 1) {
      return { ok: false, error: "Can't suspend the last admin." };
    }
  }

  await prisma.user.update({
    where: { id: id.data },
    data: { suspendedAt: target.suspendedAt ? null : new Date() },
  });
  revalidatePath("/admin/users");
  revalidatePath("/admin");
  return { ok: true };
}

export async function deleteUser(formData: FormData): Promise<ActionResult> {
  const session = await guard();

  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { ok: false, error: "Invalid payload." };

  if (id.data === session.user.id) {
    return { ok: false, error: "You can't delete yourself." };
  }

  const target = await prisma.user.findUnique({
    where: { id: id.data },
    select: {
      id: true,
      role: true,
      _count: {
        select: {
          orders: true,
          sentMessages: true,
          receivedMessages: true,
        },
      },
    },
  });
  if (!target) return { ok: false, error: "User not found." };

  if (target.role === Role.ADMIN) {
    const count = await adminCount();
    if (count <= 1) return { ok: false, error: "Can't delete the last admin." };
  }

  // Foreign keys on Order / Message default to Restrict, so block the delete
  // in our UI rather than letting Prisma throw a P2003 — suspend is the right call.
  const hasReferences =
    target._count.orders > 0 ||
    target._count.sentMessages > 0 ||
    target._count.receivedMessages > 0;
  if (hasReferences) {
    return {
      ok: false,
      error: "User has orders or messages — suspend instead of delete.",
    };
  }

  await prisma.user.delete({ where: { id: id.data } });
  revalidatePath("/admin/users");
  revalidatePath("/admin");
  return { ok: true };
}
