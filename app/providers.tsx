"use client";

import { Suspense, useEffect, useRef, type ReactNode } from "react";
import { Provider as ReduxProvider } from "react-redux";
import { SessionProvider } from "next-auth/react";

import { makeStore, type AppStore } from "@/store";
import { hydrateCartFromStorage, subscribeCartToStorage } from "@/store/persistence";
import { RouteProgress } from "@/components/layout/route-progress";

export function Providers({ children }: { children: ReactNode }) {
  const storeRef = useRef<AppStore | null>(null);
  if (!storeRef.current) storeRef.current = makeStore();

  // Hydrate from localStorage once on mount, then mirror future writes back to it.
  useEffect(() => {
    const store = storeRef.current!;
    hydrateCartFromStorage(store);
    return subscribeCartToStorage(store);
  }, []);

  return (
    <SessionProvider>
      <ReduxProvider store={storeRef.current}>
        {/* RouteProgress reads useSearchParams — wrap in Suspense so it doesn't
            opt the whole tree out of static rendering. */}
        <Suspense fallback={null}>
          <RouteProgress />
        </Suspense>
        {children}
      </ReduxProvider>
    </SessionProvider>
  );
}
