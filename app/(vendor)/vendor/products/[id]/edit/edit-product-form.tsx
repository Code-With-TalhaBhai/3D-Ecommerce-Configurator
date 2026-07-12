"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProduct, type UpdateProductState } from "../../actions";

type CategoryOption = { id: string; name: string };

type ProductData = {
  id: string;
  title: string;
  description: string;
  price: string;
  stock: number;
  categoryId: string;
};

export function EditProductForm({
  product,
  categories,
}: {
  product: ProductData;
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<UpdateProductState, FormData>(
    updateProduct,
    null,
  );

  // On a successful save, return to the products list (already revalidated).
  useEffect(() => {
    if (state?.ok) {
      router.push("/vendor/products");
      router.refresh();
    }
  }, [state, router]);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-5 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <input type="hidden" name="id" value={product.id} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          name="title"
          defaultValue={product.title}
          required
          minLength={2}
          maxLength={120}
          disabled={pending}
        />
        {state?.fieldErrors?.title && (
          <p className="text-xs text-red-600">{state.fieldErrors.title[0]}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Description</Label>
        <textarea
          id="description"
          name="description"
          defaultValue={product.description}
          required
          minLength={10}
          maxLength={5000}
          rows={4}
          disabled={pending}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:ring-zinc-100"
        />
        {state?.fieldErrors?.description && (
          <p className="text-xs text-red-600">{state.fieldErrors.description[0]}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="price">Price (USD)</Label>
          <Input
            id="price"
            name="price"
            type="number"
            step="0.01"
            min="0"
            defaultValue={product.price}
            required
            disabled={pending}
          />
          {state?.fieldErrors?.price && (
            <p className="text-xs text-red-600">{state.fieldErrors.price[0]}</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="stock">Stock</Label>
          <Input
            id="stock"
            name="stock"
            type="number"
            min="0"
            defaultValue={product.stock}
            required
            disabled={pending}
          />
          {state?.fieldErrors?.stock && (
            <p className="text-xs text-red-600">{state.fieldErrors.stock[0]}</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="categoryId">Category</Label>
        <select
          id="categoryId"
          name="categoryId"
          defaultValue={product.categoryId}
          required
          disabled={pending}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:ring-zinc-100"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {state?.fieldErrors?.categoryId && (
          <p className="text-xs text-red-600">{state.fieldErrors.categoryId[0]}</p>
        )}
      </div>

      {state?.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
