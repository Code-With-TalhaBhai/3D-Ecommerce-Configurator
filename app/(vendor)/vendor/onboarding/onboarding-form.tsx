"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createVendorStore, type OnboardingState } from "./actions";

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState<OnboardingState, FormData>(
    createVendorStore,
    null,
  );

  return (
    <form
      action={formAction}
      className="flex flex-col gap-5 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="storeName">Store name</Label>
        <Input
          id="storeName"
          name="storeName"
          required
          minLength={2}
          maxLength={60}
          placeholder="Atlas 3D Studio"
          disabled={pending}
        />
        {state?.fieldErrors?.storeName && (
          <p className="text-xs text-red-600">{state.fieldErrors.storeName[0]}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Short description</Label>
        <textarea
          id="description"
          name="description"
          rows={3}
          maxLength={500}
          placeholder="What kinds of 3D products do you sell?"
          disabled={pending}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:ring-zinc-100"
        />
        {state?.fieldErrors?.description && (
          <p className="text-xs text-red-600">{state.fieldErrors.description[0]}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="logoUrl">
          Logo URL <span className="text-zinc-400">(optional)</span>
        </Label>
        <Input
          id="logoUrl"
          name="logoUrl"
          type="url"
          placeholder="https://…"
          disabled={pending}
        />
        {state?.fieldErrors?.logoUrl && (
          <p className="text-xs text-red-600">{state.fieldErrors.logoUrl[0]}</p>
        )}
      </div>

      {state?.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Creating storefront…" : "Create storefront"}
      </Button>
    </form>
  );
}
