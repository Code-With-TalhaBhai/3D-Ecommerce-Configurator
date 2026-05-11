import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

type ViewerState = {
  color: string | null;
  material: string | null;
  textureUrl: string | null;
  variantId: string | null;
};

const initialState: ViewerState = {
  color: null,
  material: null,
  textureUrl: null,
  variantId: null,
};

const viewerSlice = createSlice({
  name: "viewer",
  initialState,
  reducers: {
    setVariant(state, action: PayloadAction<Partial<ViewerState>>) {
      Object.assign(state, action.payload);
    },
    resetVariant() {
      return initialState;
    },
  },
});

export const { setVariant, resetVariant } = viewerSlice.actions;
export default viewerSlice.reducer;
