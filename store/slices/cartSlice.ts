import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type CartItem = {
  productId: string;
  vendorId: string;
  title: string;
  price: number;
  thumbnailUrl?: string | null;
  quantity: number;
  variantId?: string;
};

type CartState = {
  items: CartItem[];
};

const initialState: CartState = {
  items: [],
};

const cartSlice = createSlice({
  name: "cart",
  initialState,
  reducers: {
    addItem(state, action: PayloadAction<CartItem>) {
      const existing = state.items.find(
        (i) =>
          i.productId === action.payload.productId &&
          i.variantId === action.payload.variantId,
      );
      if (existing) {
        existing.quantity += action.payload.quantity;
      } else {
        state.items.push(action.payload);
      }
    },
    updateQuantity(
      state,
      action: PayloadAction<{ productId: string; variantId?: string; quantity: number }>,
    ) {
      const item = state.items.find(
        (i) =>
          i.productId === action.payload.productId &&
          i.variantId === action.payload.variantId,
      );
      if (item) item.quantity = Math.max(1, action.payload.quantity);
    },
    removeItem(
      state,
      action: PayloadAction<{ productId: string; variantId?: string }>,
    ) {
      state.items = state.items.filter(
        (i) =>
          !(
            i.productId === action.payload.productId &&
            i.variantId === action.payload.variantId
          ),
      );
    },
    clearCart(state) {
      state.items = [];
    },
    hydrate(state, action: PayloadAction<CartState>) {
      state.items = action.payload.items;
    },
  },
});

export const { addItem, updateQuantity, removeItem, clearCart, hydrate } =
  cartSlice.actions;
export default cartSlice.reducer;
