"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Thin top-of-window progress bar that animates while the App Router commits a
 * new segment. Pairs with segment-level `loading.tsx` files: the bar gives
 * *router-level* feedback the instant the user clicks a link, the loading.tsx
 * fallback covers the segment body while the new RSC payload streams in.
 *
 * Detection strategy:
 *   - Listen for left-click on internal anchors (Next Link renders an <a>) and
 *     start the bar immediately.
 *   - Also patch history.pushState / replaceState so programmatic router.push
 *     calls trigger the bar.
 *   - End the bar when pathname or searchParams change (commit landed) or on
 *     popstate. A short minimum duration keeps the animation visible on very
 *     fast navigations.
 *
 * Important: every state update is dispatched via `queueMicrotask`, never
 * synchronously from a triggered event. Reason: Next's App Router commits
 * navigations by calling `history.pushState` from a `useInsertionEffect`
 * callback. React forbids scheduling updates from that hook ("useInsertionEffect
 * must not schedule updates"). Deferring to a microtask hops us out of the
 * insertion-effect phase into the normal task queue, where setState is legal.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<"idle" | "loading" | "finishing">("idle");
  const startedAt = useRef<number>(0);
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirror of `phase` that's safe to read from inside closures (the useEffect
  // below intentionally runs only once, so closing over the React state would
  // give us a stale value).
  const phaseRef = useRef<"idle" | "loading" | "finishing">("idle");

  const MIN_VISIBLE_MS = 320;
  const FADE_MS = 220;

  function clearTimers() {
    if (finishTimer.current) {
      clearTimeout(finishTimer.current);
      finishTimer.current = null;
    }
    if (fadeTimer.current) {
      clearTimeout(fadeTimer.current);
      fadeTimer.current = null;
    }
  }

  function setPhaseSafe(next: "idle" | "loading" | "finishing") {
    phaseRef.current = next;
    // Defer the actual React state update so it can never land inside a
    // useInsertionEffect callback (see header comment).
    queueMicrotask(() => setPhase(next));
  }

  function start() {
    if (phaseRef.current === "loading") return;
    clearTimers();
    startedAt.current = performance.now();
    setPhaseSafe("loading");
  }

  function finish() {
    if (phaseRef.current === "idle") return;
    const elapsed = performance.now() - startedAt.current;
    const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);
    if (finishTimer.current) clearTimeout(finishTimer.current);
    finishTimer.current = setTimeout(() => {
      setPhaseSafe("finishing");
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
      fadeTimer.current = setTimeout(() => setPhaseSafe("idle"), FADE_MS);
    }, wait);
  }

  // Subscribe to navigation triggers exactly once. start() / finish() use refs
  // for current state, so they don't need to be re-installed when phase changes.
  useEffect(() => {
    // 1. Anchor clicks — same-origin, no modifier, default-button only
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const target = e.target as Element | null;
      const anchor = target?.closest?.("a") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return;
      }

      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;

      // Skip in-page hash-only navigations.
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search &&
        url.hash
      ) {
        return;
      }

      start();
    }

    // 2. Programmatic navigation — patch history methods. We MUST NOT call
    // setState synchronously here; Next invokes pushState from a
    // useInsertionEffect, and React would throw. start() defers via microtask.
    const originalPush = window.history.pushState;
    const originalReplace = window.history.replaceState;
    window.history.pushState = function (...args) {
      const result = originalPush.apply(this, args);
      start();
      return result;
    };
    window.history.replaceState = function (...args) {
      const result = originalReplace.apply(this, args);
      start();
      return result;
    };

    // 3. Back / forward buttons
    function onPopState() {
      start();
    }

    document.addEventListener("click", onClick, { capture: true });
    window.addEventListener("popstate", onPopState);

    return () => {
      document.removeEventListener("click", onClick, { capture: true } as never);
      window.removeEventListener("popstate", onPopState);
      // Only restore if no one else has patched on top of us.
      if (window.history.pushState !== originalPush) {
        // Another patch installed after us — leave the chain alone.
      } else {
        window.history.pushState = originalPush;
      }
      if (window.history.replaceState !== originalReplace) {
        // same
      } else {
        window.history.replaceState = originalReplace;
      }
      clearTimers();
    };
    // Install once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Commit landed — finish the bar.
  useEffect(() => {
    if (phaseRef.current === "idle") return;
    finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  if (phase === "idle") return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[2px] overflow-hidden"
    >
      <div
        className={
          phase === "finishing"
            ? "h-full w-full origin-left scale-x-100 bg-gradient-to-r from-zinc-700 via-zinc-900 to-zinc-700 opacity-0 shadow-[0_0_10px_rgb(24_24_27_/_0.4)] transition-opacity duration-200 ease-out dark:from-zinc-300 dark:via-zinc-100 dark:to-zinc-300 dark:shadow-[0_0_10px_rgb(250_250_250_/_0.4)]"
            : "h-full w-full origin-left animate-[route-progress_1.4s_cubic-bezier(0.4,0,0.2,1)_forwards] bg-gradient-to-r from-zinc-700 via-zinc-900 to-zinc-700 shadow-[0_0_10px_rgb(24_24_27_/_0.4)] dark:from-zinc-300 dark:via-zinc-100 dark:to-zinc-300 dark:shadow-[0_0_10px_rgb(250_250_250_/_0.4)]"
        }
      />
    </div>
  );
}
