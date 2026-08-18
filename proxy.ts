import NextAuth from "next-auth";

import { authConfig } from "@/auth.config";

// Edge-safe: do NOT import Prisma or bcrypt here.
// proxy.ts (Next 16's renamed middleware) runs on every request — use authConfig only.
export default NextAuth(authConfig).auth;

export const config = {
  // /mediapipe/* excluded: large (multi-MB) static WASM/model assets for
  // virtual try-on, public and unauthenticated — running them through the
  // auth check on every request is pure overhead with no security benefit.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|mediapipe|.*\\.svg|.*\\.png).*)"],
};
