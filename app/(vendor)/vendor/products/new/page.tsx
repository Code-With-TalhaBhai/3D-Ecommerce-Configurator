import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NewProductForm } from "./new-product-form";

export const metadata = { title: "Upload product" };

export default async function NewProductPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const vendor = await prisma.vendor.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!vendor) redirect("/vendor/onboarding");

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Upload a 3D product
        </h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          GLB files only, up to 50 MB and 100,000 triangles. Models are
          Draco-compressed on the server and reviewed by an admin before going live.
        </p>
      </div>
      <NewProductForm />
    </div>
  );
}
