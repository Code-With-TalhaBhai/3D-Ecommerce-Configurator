import Link from "next/link";
import { ArrowRight, Box, Palette, Sparkles, Zap } from "lucide-react";

import { auth } from "@/auth";
import { signOutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

export default async function Home() {
  const session = await auth();

  return (
    <div className="relative flex min-h-screen flex-col bg-white dark:bg-zinc-950">
      <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/70 backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-950/70">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-6 px-6">
          <Link href="/" className="group flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-zinc-900 text-[11px] font-semibold tracking-tight text-white shadow-sm shadow-zinc-900/20 transition-transform duration-150 group-hover:scale-105 dark:bg-zinc-100 dark:text-zinc-900 dark:shadow-none">
              3D
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              Marketplace
            </span>
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            {session?.user ? (
              <>
                <span className="hidden text-zinc-500 sm:inline dark:text-zinc-400">
                  {session.user.email}
                </span>
                {session.user.role === "VENDOR" && (
                  <Link
                    href="/vendor"
                    className="rounded-md px-3 py-1.5 text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                  >
                    Vendor console
                  </Link>
                )}
                {session.user.role === "ADMIN" && (
                  <Link
                    href="/admin"
                    className="rounded-md px-3 py-1.5 text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                  >
                    Admin
                  </Link>
                )}
                <form action={signOutAction}>
                  <Button type="submit" variant="secondary" size="sm">
                    Sign out
                  </Button>
                </form>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-md px-3 py-1.5 text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
                  className="inline-flex h-8 items-center justify-center rounded-lg bg-zinc-900 px-3 text-xs font-medium tracking-tight text-white shadow-sm shadow-zinc-900/10 transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:shadow-none dark:hover:bg-white"
                >
                  Create account
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="relative flex flex-1 flex-col">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="bg-grid-fade pointer-events-none absolute inset-0" />
          <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 flex justify-center">
            <div className="h-[480px] w-[820px] rounded-full bg-gradient-to-br from-zinc-200/60 via-white to-transparent blur-3xl dark:from-zinc-800/40 dark:via-zinc-950" />
          </div>

          <div className="mx-auto flex max-w-5xl flex-col items-center px-6 pt-20 pb-28 text-center sm:pt-28 sm:pb-32">
            <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200/80 bg-white/70 px-3 py-1 text-xs font-medium text-zinc-700 shadow-sm shadow-zinc-900/[0.03] backdrop-blur dark:border-zinc-800/80 dark:bg-zinc-900/60 dark:text-zinc-300">
              <Sparkles className="h-3.5 w-3.5" />
              Real-time 3D commerce — no plugins required
            </span>
            <h1 className="mt-6 max-w-3xl text-balance text-4xl font-semibold tracking-[-0.04em] text-zinc-900 sm:text-6xl dark:text-zinc-50">
              Shop products in real-time 3D.
            </h1>
            <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-zinc-600 sm:text-lg dark:text-zinc-400">
              Rotate, zoom, and customise materials before you buy. Vendors
              upload GLB models; customers configure and check out — instantly,
              in any modern browser.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/products"
                className="group inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-6 text-sm font-medium tracking-tight text-white shadow-sm shadow-zinc-900/20 transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:shadow-none dark:hover:bg-white"
              >
                Browse products
                <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" />
              </Link>
              <Link
                href={session?.user ? "/vendor" : "/register"}
                className="inline-flex h-11 items-center justify-center rounded-lg border border-zinc-200 bg-white px-6 text-sm font-medium tracking-tight text-zinc-900 shadow-sm shadow-zinc-900/[0.03] transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:shadow-none dark:hover:border-zinc-700 dark:hover:bg-zinc-800"
              >
                {session?.user ? "Vendor console" : "Sell on 3D Marketplace"}
              </Link>
            </div>

            {/* Feature row */}
            <div className="mt-20 grid w-full max-w-4xl grid-cols-1 gap-px overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-200 text-left shadow-sm shadow-zinc-900/[0.03] sm:grid-cols-3 dark:border-zinc-800 dark:bg-zinc-800 dark:shadow-none">
              <FeatureCell
                icon={<Box className="h-4 w-4" />}
                title="Interactive 3D viewer"
                copy="Orbit, pan, zoom — every product is a fully explorable model."
              />
              <FeatureCell
                icon={<Palette className="h-4 w-4" />}
                title="Live customisation"
                copy="Swap colour, finish, lighting and backdrop in real time."
              />
              <FeatureCell
                icon={<Zap className="h-4 w-4" />}
                title="Optimised delivery"
                copy="Draco-compressed GLB streamed via CDN for fast first frames."
              />
            </div>
          </div>
        </section>

        <footer className="border-t border-zinc-200/80 py-8 dark:border-zinc-800/80">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-6 text-xs text-zinc-500 sm:flex-row dark:text-zinc-400">
            <span>© {new Date().getFullYear()} 3D Marketplace</span>
            <span className="text-zinc-400 dark:text-zinc-500">
              Built with Next.js, React Three Fiber & Stripe.
            </span>
          </div>
        </footer>
      </main>
    </div>
  );
}

function FeatureCell({
  icon,
  title,
  copy,
}: {
  icon: React.ReactNode;
  title: string;
  copy: string;
}) {
  return (
    <div className="flex flex-col gap-2 bg-white p-6 dark:bg-zinc-950">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
        {icon}
      </span>
      <h3 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        {title}
      </h3>
      <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
        {copy}
      </p>
    </div>
  );
}
