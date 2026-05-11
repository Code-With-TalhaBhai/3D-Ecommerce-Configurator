import type { NextAuthConfig } from "next-auth";

// Edge-safe config: no Prisma, no bcrypt. Used by proxy.ts and re-exported into auth.ts.
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role?: "ADMIN" | "VENDOR" | "CUSTOMER" }).role ?? "CUSTOMER";
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "ADMIN" | "VENDOR" | "CUSTOMER";
      }
      return session;
    },
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;

      const isAdminRoute = pathname.startsWith("/admin");
      const isVendorRoute = pathname.startsWith("/vendor");
      const isAccountRoute =
        pathname.startsWith("/account") || pathname.startsWith("/checkout");

      const requiresAuth = isAdminRoute || isVendorRoute || isAccountRoute;
      if (!requiresAuth) return true;

      if (!auth?.user) return false;

      const role = auth.user.role;
      if (isAdminRoute && role !== "ADMIN") return false;
      if (isVendorRoute && role !== "VENDOR" && role !== "ADMIN") return false;
      return true;
    },
  },
  providers: [], // populated in auth.ts (Node-only providers live there)
} satisfies NextAuthConfig;
