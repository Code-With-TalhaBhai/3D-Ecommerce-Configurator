import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <div className="bg-grid-fade pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 flex justify-center">
        <div className="h-[420px] w-[640px] rounded-full bg-gradient-to-br from-white via-zinc-100/80 to-transparent blur-3xl dark:from-zinc-900/60 dark:via-zinc-950" />
      </div>

      <Link
        href="/"
        className="group mb-8 flex items-center gap-2"
      >
        <span className="grid h-7 w-7 place-items-center rounded-md bg-zinc-900 text-[11px] font-semibold tracking-tight text-white shadow-sm shadow-zinc-900/20 transition-transform duration-150 group-hover:scale-105 dark:bg-zinc-100 dark:text-zinc-900 dark:shadow-none">
          3D
        </span>
        <span className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Marketplace
        </span>
      </Link>
      <div className="relative w-full max-w-sm rounded-2xl border border-zinc-200/80 bg-white/80 p-8 shadow-xl shadow-zinc-900/[0.04] backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-900/70 dark:shadow-black/30">
        {children}
      </div>
      <p className="mt-8 text-center text-xs text-zinc-500 dark:text-zinc-400">
        Protected by industry-standard encryption.
      </p>
    </div>
  );
}
