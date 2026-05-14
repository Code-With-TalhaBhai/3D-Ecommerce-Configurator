import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

// Customer-facing finish presets. Internally each maps to a roughness +
// metalness (+ clearcoat) combo on the loaded material — buyers only see
// the human label.
export const FINISHES = [
  "default",
  "matte",
  "satin",
  "glossy",
  "metallic",
  "polished",
] as const;
export type Finish = (typeof FINISHES)[number];

// Customer-facing lighting moods. Each maps to a drei HDR preset internally.
export const LIGHTING_PRESETS = [
  "studio",
  "daylight",
  "showroom",
  "cozy",
  "evening",
] as const;
export type LightingPreset = (typeof LIGHTING_PRESETS)[number];

export type ViewerState = {
  // Vendor variant reference — survives into the cart line item.
  variantId: string | null;

  // Buyer-side material overrides (null = restore the GLB original).
  color: string | null;
  textureUrl: string | null;
  material: string | null;
  finish: Finish;

  // Presentation
  lighting: LightingPreset;
  backgroundColor: string | null;
  autoRotate: boolean;
};

const defaults: ViewerState = {
  variantId: null,

  color: null,
  textureUrl: null,
  material: null,
  finish: "default",

  lighting: "studio",
  backgroundColor: null,
  autoRotate: false,
};

const viewerSlice = createSlice({
  name: "viewer",
  initialState: defaults,
  reducers: {
    /** Apply a vendor variant — overrides color / material / texture / variantId. */
    setVariant(state, action: PayloadAction<Partial<ViewerState>>) {
      Object.assign(state, action.payload);
    },
    /** Generic partial patch for the customer-facing controls. */
    patchViewer(state, action: PayloadAction<Partial<ViewerState>>) {
      Object.assign(state, action.payload);
    },
    /** Reset everything (including the vendor variant) back to defaults. */
    resetVariant() {
      return defaults;
    },
    /** Reset only the customer's fine-tuning; preserve the picked vendor variant. */
    resetTuning(state) {
      state.finish = defaults.finish;
      state.lighting = defaults.lighting;
      state.backgroundColor = defaults.backgroundColor;
      state.autoRotate = defaults.autoRotate;
    },
  },
});

export const { setVariant, patchViewer, resetVariant, resetTuning } = viewerSlice.actions;
export default viewerSlice.reducer;
export const viewerDefaults = defaults;
