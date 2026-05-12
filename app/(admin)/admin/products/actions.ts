"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

const idSchema = z.string().min(1);

export async function approveProduct(formData: FormData) {
  await requireAdmin();
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  await prisma.product.update({
    where: { id: id.data },
    data: { status: "APPROVED", rejectionReason: null },
  });
  revalidatePath("/admin/products");
  revalidatePath("/admin");
}

export type RejectResult = { ok: true } | { ok: false; error: string };

const rejectSchema = z.object({
  id: z.string().min(1),
  reason: z.string().trim().min(5, "Reason must be at least 5 characters").max(500),
});

export async function rejectProduct(formData: FormData): Promise<RejectResult> {
  await requireAdmin();
  const parsed = rejectSchema.safeParse({
    id: formData.get("id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Invalid input.";
    return { ok: false, error: first };
  }
  await prisma.product.update({
    where: { id: parsed.data.id },
    data: { status: "REJECTED", rejectionReason: parsed.data.reason },
  });
  revalidatePath("/admin/products");
  revalidatePath("/admin");
  return { ok: true };
}
