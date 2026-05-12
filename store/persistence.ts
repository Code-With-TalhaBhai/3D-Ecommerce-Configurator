import { z } from "zod";

import type { AppStore } from "@/store";
import { hydrate } from "@/store/slices/cartSlice";

const STORAGE_KEY = "3dmkt:cart:v1";

// Validate persisted data — guards against stale shapes or hand-edited localStorage.
const cartItemSchema = z.object({
  productId: z.string(),
  vendorId: z.string(),
  title: z.string(),
  price: z.number().nonnegative(),
  thumbnailUrl: z.string().nullable().optional(),
  quantity: z.number().int().positive(),
  variantId: z.string().optional(),
});

const persistedCartSchema = z.object({
  items: z.array(cartItemSchema),
});

export function hydrateCartFromStorage(store: AppStore) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = persistedCartSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      // Wipe corrupted state so the next write replaces it cleanly.
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    store.dispatch(hydrate(parsed.data));
  } catch {
    // Swallow JSON parse / storage errors silently — the cart just stays empty.
  }
}

/** Subscribe to cart changes and mirror them into localStorage. Returns an unsubscribe. */
export function subscribeCartToStorage(store: AppStore) {
  if (typeof window === "undefined") return () => {};
  let lastSerialized = "";
  return store.subscribe(() => {
    const { items } = store.getState().cart;
    // Cheap diff: only write when serialized output actually changes.
    const next = JSON.stringify({ items });
    if (next === lastSerialized) return;
    lastSerialized = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Quota exceeded / private mode — give up silently.
    }
  });
}
