"use client";

import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCategory, type CategoryFormState } from "./actions";

export function CategoryForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<CategoryFormState, FormData>(
    createCategory,
    null,
  );

  // Clear the input after a successful create (action resolves to null).
  useEffect(() => {
    if (state === null) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="name">Category name</Label>
        <Input
          id="name"
          name="name"
          placeholder="e.g. Furniture"
          maxLength={40}
          required
          disabled={pending}
        />
        {state?.fieldErrors?.name && (
          <p className="text-xs text-red-600">{state.fieldErrors.name[0]}</p>
        )}
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add category"}
      </Button>

      {state?.error && (
        <p className="w-full rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300 sm:w-auto">
          {state.error}
        </p>
      )}
    </form>
  );
}
