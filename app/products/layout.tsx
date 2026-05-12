import type { ReactNode } from "react";

import { PublicHeader } from "@/components/layout/public-header";

export default function ProductsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-zinc-950">
      <PublicHeader />
      <main className="flex-1">{children}</main>
    </div>
  );
}
