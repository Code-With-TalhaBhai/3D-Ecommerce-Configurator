import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Set up your storefront" };

export default async function VendorOnboardingPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const vendor = await prisma.vendor.findUnique({
    where: { userId: session.user.id },
  });
  if (vendor) redirect("/vendor");

  return (
    <div className="mx-auto max-w-xl px-6 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Set up your storefront
        </h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Tell customers who you are. Your store goes live after admin review.
        </p>
      </div>
      <OnboardingForm />
    </div>
  );
}
