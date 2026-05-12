"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { deleteProduct } from "./actions";

export function ProductActions({
  productId,
  hasOrders,
}: {
  productId: string;
  hasOrders: boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onDelete() {
    setError(null);
    const fd = new FormData();
    fd.set("id", productId);
    startTransition(async () => {
      const result = await deleteProduct(fd);
      if (!result.ok) {
        setError(result.error);
        setConfirm(false);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {confirm ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onDelete}
            disabled={pending}
          >
            Confirm delete
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setConfirm(false)}
            disabled={pending}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setConfirm(true)}
          disabled={pending || hasOrders}
          title={hasOrders ? "Has orders — set stock to 0 instead" : undefined}
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </Button>
      )}
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
