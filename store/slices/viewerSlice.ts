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

// A selectable region of the loaded model. Parts are discovered by the viewer
// at load time (grouped by GLB material name) and pushed into the store so the
// controls panel can render a part picker.
export type ViewerPart = { id: string; label: string };

export type ViewerState = {
  // Vendor variant reference — survives into the cart line item.
  variantId: string | null;

  // Buyer-side material overrides (null = restore the GLB original).
  color: string | null;
  textureUrl: string | null;
  material: string | null;
  finish: Finish;

  // Per-part color customization. `partColors[partId]` wins over the
  // whole-product `color` for that part. `selectedPartId` is the part the
  // color swatches currently target (null = whole product); `highlightedPartId`
  // drives a temporary emissive glow so the buyer can see which part a chip
  // refers to.
  parts: ViewerPart[];
  selectedPartId: string | null;
  highlightedPartId: string | null;
  partColors: Record<string, string>;

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

  parts: [],
  selectedPartId: null,
  highlightedPartId: null,
  partColors: {},

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
      // A vendor variant is a whole-product look — per-part tweaks made
      // against the previous look would fight it, so clear them.
      state.partColors = {};
      state.selectedPartId = null;
    },
    /** Generic partial patch for the customer-facing controls. */
    patchViewer(state, action: PayloadAction<Partial<ViewerState>>) {
      Object.assign(state, action.payload);
    },
    /** Called by the viewer once the GLB scene is traversed. */
    setParts(state, action: PayloadAction<ViewerPart[]>) {
      state.parts = action.payload;
      // Prune references to parts that no longer exist (e.g. a different
      // model finished loading).
      const ids = new Set(action.payload.map((p) => p.id));
      if (state.selectedPartId && !ids.has(state.selectedPartId)) {
        state.selectedPartId = null;
      }
      if (state.highlightedPartId && !ids.has(state.highlightedPartId)) {
        state.highlightedPartId = null;
      }
      for (const id of Object.keys(state.partColors)) {
        if (!ids.has(id)) delete state.partColors[id];
      }
    },
    /** Target a part with the color controls (null = whole product). */
    selectPart(state, action: PayloadAction<string | null>) {
      state.selectedPartId = action.payload;
    },
    /** Temporarily glow a part on the model (hover feedback). */
    highlightPart(state, action: PayloadAction<string | null>) {
      state.highlightedPartId = action.payload;
    },
    /**
     * Set a color for one part, or for the whole product when partId is null.
     * A whole-product pick clears every per-part override so it truly applies
     * everywhere; picking null color restores the original.
     */
    setPartColor(
      state,
      action: PayloadAction<{ partId: string | null; color: string | null }>,
    ) {
      const { partId, color } = action.payload;
      if (partId === null) {
        state.color = color;
        state.partColors = {};
      } else if (color === null) {
        delete state.partColors[partId];
      } else {
        state.partColors[partId] = color;
      }
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

export const {
  setVariant,
  patchViewer,
  setParts,
  selectPart,
  highlightPart,
  setPartColor,
  resetVariant,
  resetTuning,
} = viewerSlice.actions;
export default viewerSlice.reducer;
export const viewerDefaults = defaults;
