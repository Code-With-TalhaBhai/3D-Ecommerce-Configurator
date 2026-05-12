"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPromo, type PromoFormState } from "./actions";

export function PromoForm() {
  const [discountType, setDiscountType] = useState<"PERCENT" | "FIXED">("PERCENT");
  const [state, formAction, pending] = useActionState<PromoFormState, FormData>(
    createPromo,
    null,
  );

  return (
    <form action={formAction} className="mt-4 grid gap-3 sm:grid-cols-[1.2fr,1fr,1fr,auto]">
      <input type="hidden" name="discountType" value={discountType} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="code">Code</Label>
        <Input
          id="code"
          name="code"
          placeholder="SUMMER10"
          maxLength={32}
          required
          disabled={pending}
          style={{ textTransform: "uppercase" }}
        />
        {state?.fieldErrors?.code && (
          <p className="text-xs text-red-600">{state.fieldErrors.code[0]}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Type</Label>
        <div className="inline-flex rounded-md border border-zinc-300 dark:border-zinc-700">
          <button
            type="button"
            onClick={() => setDiscountType("PERCENT")}
            disabled={pending}
            className={`flex-1 px-3 py-2 text-xs font-medium ${
              discountType === "PERCENT"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-600 dark:text-zinc-400"
            }`}
          >
            Percent
          </button>
          <button
            type="button"
            onClick={() => setDiscountType("FIXED")}
            disabled={pending}
            className={`flex-1 px-3 py-2 text-xs font-medium ${
              discountType === "FIXED"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-600 dark:text-zinc-400"
            }`}
          >
            Fixed $
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="discountValue">{discountType === "PERCENT" ? "% off" : "$ off"}</Label>
        <Input
          id="discountValue"
          name="discountValue"
          type="number"
          step={discountType === "PERCENT" ? "1" : "0.01"}
          min="0"
          max={discountType === "PERCENT" ? "100" : undefined}
          required
          disabled={pending}
        />
        {state?.fieldErrors?.discountValue && (
          <p className="text-xs text-red-600">{state.fieldErrors.discountValue[0]}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="expiresAt">Expires (optional)</Label>
        <Input id="expiresAt" name="expiresAt" type="date" disabled={pending} />
        {state?.fieldErrors?.expiresAt && (
          <p className="text-xs text-red-600">{state.fieldErrors.expiresAt[0]}</p>
        )}
      </div>

      <div className="flex items-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create code"}
        </Button>
      </div>

      {state?.error && (
        <p className="sm:col-span-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {state.error}
        </p>
      )}
    </form>
  );
}
