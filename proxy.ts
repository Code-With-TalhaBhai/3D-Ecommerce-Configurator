import NextAuth from "next-auth";

import { authConfig } from "@/auth.config";

// Edge-safe: do NOT import Prisma or bcrypt here.
// proxy.ts (Next 16's renamed middleware) runs on every request — use authConfig only.
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.svg|.*\\.png).*)"],
};
