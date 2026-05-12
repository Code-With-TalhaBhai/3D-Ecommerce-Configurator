"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export type PromoFormState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
} | null;

const createSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3, "Code must be at least 3 characters")
    .max(32, "Code must be 32 characters or fewer")
    .regex(/^[A-Z0-9_-]+$/, "Use A-Z, 0-9, underscore, or hyphen only"),
  discountType: z.enum(["PERCENT", "FIXED"]),
  discountValue: z.coerce.number().positive().max(100_000),
  expiresAt: z.string().optional(),
});

export async function createPromo(
  _prev: PromoFormState,
  formData: FormData,
): Promise<PromoFormState> {
  await requireAdmin();

  const parsed = createSchema.safeParse({
    code: typeof formData.get("code") === "string" ? (formData.get("code") as string).toUpperCase() : "",
    discountType: formData.get("discountType"),
    discountValue: formData.get("discountValue"),
    expiresAt: formData.get("expiresAt") || undefined,
  });
  if (!parsed.success) {
    return {
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }

  // Percent caps at 100; fixed has no upper bound beyond the schema cap.
  if (parsed.data.discountType === "PERCENT" && parsed.data.discountValue > 100) {
    return { error: "Percent discount can't exceed 100." };
  }

  const existing = await prisma.promoCode.findUnique({
    where: { code: parsed.data.code },
  });
  if (existing) return { error: "That code already exists." };

  let expiresAt: Date | null = null;
  if (parsed.data.expiresAt) {
    const parsedDate = new Date(parsed.data.expiresAt);
    if (Number.isNaN(parsedDate.valueOf())) {
      return { fieldErrors: { expiresAt: ["Invalid date"] } };
    }
    expiresAt = parsedDate;
  }

  await prisma.promoCode.create({
    data: {
      code: parsed.data.code,
      discountType: parsed.data.discountType,
      discountValue: parsed.data.discountValue,
      expiresAt,
    },
  });
  revalidatePath("/admin/promos");
  return null;
}

export async function expirePromo(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.promoCode.update({
    where: { id },
    data: { expiresAt: new Date() },
  });
  revalidatePath("/admin/promos");
}

export async function deletePromo(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.promoCode.delete({ where: { id } });
  revalidatePath("/admin/promos");
}
