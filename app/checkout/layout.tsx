import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { auth } from "@/auth";
import { PublicHeader } from "@/components/layout/public-header";

export const metadata = { title: "Checkout" };

export default async function CheckoutLayout({ children }: { children: ReactNode }) {
  // Defense-in-depth: proxy.ts already gates /checkout, but if someone hits an
  // edge case (cookie wipe between proxy + render), bounce them to /login.
  const session = await auth();
  if (!session?.user) redirect("/login?from=/checkout");

  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-zinc-950">
      <PublicHeader />
      <main className="flex-1">{children}</main>
    </div>
  );
}
