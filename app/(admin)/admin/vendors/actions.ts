"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

const idSchema = z.string().min(1);

export async function approveVendor(formData: FormData) {
  await requireAdmin();
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  await prisma.vendor.update({
    where: { id: id.data },
    data: { approvedAt: new Date() },
  });
  revalidatePath("/admin/vendors");
  revalidatePath("/admin");
}

export async function unapproveVendor(formData: FormData) {
  await requireAdmin();
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return;
  await prisma.vendor.update({
    where: { id: id.data },
    data: { approvedAt: null },
  });
  revalidatePath("/admin/vendors");
  revalidatePath("/admin");
}
