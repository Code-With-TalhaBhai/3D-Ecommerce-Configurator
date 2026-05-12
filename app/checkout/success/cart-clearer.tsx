"use client";

import { useEffect } from "react";

import { useAppDispatch } from "@/store/hooks";
import { clearCart } from "@/store/slices/cartSlice";

// Drains the local Redux cart on a successful checkout landing.
// Runs exactly once per mount of the success page.
export function CartClearer() {
  const dispatch = useAppDispatch();
  useEffect(() => {
    dispatch(clearCart());
  }, [dispatch]);
  return null;
}
