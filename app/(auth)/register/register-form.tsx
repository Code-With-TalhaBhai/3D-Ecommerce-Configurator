"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { registerAction, type FormState } from "@/app/(auth)/actions";

type Role = "CUSTOMER" | "VENDOR";

export function RegisterForm() {
  const [role, setRole] = useState<Role>("CUSTOMER");
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    registerAction,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="role" value={role} />

      <div className="grid grid-cols-2 gap-2">
        <RoleOption
          label="Customer"
          description="Browse and buy"
          active={role === "CUSTOMER"}
          onClick={() => setRole("CUSTOMER")}
        />
        <RoleOption
          label="Vendor"
          description="Sell in 3D"
          active={role === "VENDOR"}
          onClick={() => setRole("VENDOR")}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">{role === "VENDOR" ? "Your name" : "Full name"}</Label>
        <Input
          id="name"
          name="name"
          autoComplete="name"
          required
          disabled={pending}
        />
        {state?.fieldErrors?.name && (
          <p className="text-xs text-red-600">{state.fieldErrors.name[0]}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={pending}
        />
        {state?.fieldErrors?.email && (
          <p className="text-xs text-red-600">{state.fieldErrors.email[0]}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          disabled={pending}
        />
        {state?.fieldErrors?.password && (
          <p className="text-xs text-red-600">{state.fieldErrors.password[0]}</p>
        )}
      </div>

      {state?.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending
          ? "Creating account…"
          : role === "VENDOR"
            ? "Create vendor account"
            : "Create account"}
      </Button>
    </form>
  );
}

function RoleOption({
  label,
  description,
  active,
  onClick,
}: {
  label: string;
  description: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-start rounded-md border px-3 py-2 text-left transition-colors",
        active
          ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-800"
          : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500",
      )}
    >
      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
        {label}
      </span>
      <span className="text-xs text-zinc-500 dark:text-zinc-400">{description}</span>
    </button>
  );
}
