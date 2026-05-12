"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    throw new Error("Forbidden");
  }
  return session;
}

export async function approveProduct(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  if (!id) return;
  await prisma.product.update({
    where: { id },
    data: { status: "APPROVED" },
  });
  revalidatePath("/admin/products");
  revalidatePath("/admin");
}

export async function rejectProduct(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  if (!id) return;
  await prisma.product.update({
    where: { id },
    data: { status: "REJECTED" },
  });
  revalidatePath("/admin/products");
  revalidatePath("/admin");
}
