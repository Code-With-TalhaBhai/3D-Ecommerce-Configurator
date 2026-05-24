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

  // Approving a vendor IS the trust gate — flip the vendor and any of their
  // queued PENDING products to APPROVED in one transaction so the admin
  // doesn't have to re-tour the product queue afterwards. REJECTED products
  // stay rejected; admin must restore them individually.
  await prisma.$transaction([
    prisma.vendor.update({
      where: { id: id.data },
      data: { approvedAt: new Date() },
    }),
    prisma.product.updateMany({
      where: { vendorId: id.data, status: "PENDING" },
      data: { status: "APPROVED" },
    }),
  ]);

  revalidatePath("/admin/vendors");
  revalidatePath("/admin");
  // Just-approved products may now be live; invalidate the surfaces that
  // filter on status.
  revalidatePath("/admin/products");
  revalidatePath("/products");
  revalidatePath("/vendor/products");
}

export async function unapproveVendor(formData: FormData) {
  await requireAdmin();
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return;

  // Revoking vendor approval intentionally does NOT pull back already-live
  // products — those have been individually visible to customers and may sit
  // in carts/orders. Admin can revoke a specific listing from
  // /admin/products (Approved tab → Revoke). Future uploads from this vendor
  // will fall back to PENDING because vendor.approvedAt is now null.
  await prisma.vendor.update({
    where: { id: id.data },
    data: { approvedAt: null },
  });

  revalidatePath("/admin/vendors");
  revalidatePath("/admin");
}
