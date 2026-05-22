import Link from "next/link";

import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-zinc-900 dark:text-zinc-50">
          Welcome back
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Sign in to your account to continue.
        </p>
      </div>
      <LoginForm />
      <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
        New here?{" "}
        <Link
          href="/register"
          className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
