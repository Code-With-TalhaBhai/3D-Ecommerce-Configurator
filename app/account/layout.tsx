import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { auth } from "@/auth";
import { PublicHeader } from "@/components/layout/public-header";

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login?from=/account/orders");

  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-zinc-950">
      <PublicHeader />
      <main className="flex-1">{children}</main>
    </div>
  );
}
