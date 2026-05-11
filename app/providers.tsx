"use client";

import { useRef, type ReactNode } from "react";
import { Provider as ReduxProvider } from "react-redux";
import { SessionProvider } from "next-auth/react";

import { makeStore, type AppStore } from "@/store";

export function Providers({ children }: { children: ReactNode }) {
  const storeRef = useRef<AppStore | null>(null);
  if (!storeRef.current) storeRef.current = makeStore();

  return (
    <SessionProvider>
      <ReduxProvider store={storeRef.current}>{children}</ReduxProvider>
    </SessionProvider>
  );
}
