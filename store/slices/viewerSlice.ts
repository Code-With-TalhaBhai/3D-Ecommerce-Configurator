import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export const ENV_PRESETS = [
  "studio",
  "sunset",
  "dawn",
  "warehouse",
  "city",
  "park",
  "lobby",
  "apartment",
  "night",
  "forest",
] as const;
export type EnvPreset = (typeof ENV_PRESETS)[number];

export type ViewerState = {
  // Vendor-preset reference (still useful for cart line-item attribution).
  variantId: string | null;

  // Material overrides (null means "use the loaded GLB's original").
  color: string | null;
  textureUrl: string | null;
  material: string | null;
  roughness: number;
  metalness: number;
  emissiveColor: string;
  emissiveIntensity: number;
  clearcoat: number;
  textureRepeat: number;

  // Scene
  envPreset: EnvPreset;
  envIntensity: number;
  backgroundColor: string | null;
  autoRotate: boolean;
  autoRotateSpeed: number;

  // View
  scale: number;
  wireframe: boolean;
};

const defaults: ViewerState = {
  variantId: null,

  color: null,
  textureUrl: null,
  material: null,
  roughness: 0.5,
  metalness: 0,
  emissiveColor: "#000000",
  emissiveIntensity: 0,
  clearcoat: 0,
  textureRepeat: 1,

  envPreset: "studio",
  envIntensity: 1,
  backgroundColor: null,
  autoRotate: false,
  autoRotateSpeed: 1,

  scale: 1,
  wireframe: false,
};

const viewerSlice = createSlice({
  name: "viewer",
  initialState: defaults,
  reducers: {
    /** Apply a vendor variant — overrides color/material/texture, leaves other axes alone. */
    setVariant(state, action: PayloadAction<Partial<ViewerState>>) {
      Object.assign(state, action.payload);
    },
    /** Generic partial patch — used by the controls panel for any of the new axes. */
    patchViewer(state, action: PayloadAction<Partial<ViewerState>>) {
      Object.assign(state, action.payload);
    },
    /** Reset everything (including the variant) back to defaults. */
    resetVariant() {
      return defaults;
    },
    /** Reset only the fine-tuning sliders; preserve the variant selection. */
    resetTuning(state) {
      state.roughness = defaults.roughness;
      state.metalness = defaults.metalness;
      state.emissiveColor = defaults.emissiveColor;
      state.emissiveIntensity = defaults.emissiveIntensity;
      state.clearcoat = defaults.clearcoat;
      state.textureRepeat = defaults.textureRepeat;
      state.envPreset = defaults.envPreset;
      state.envIntensity = defaults.envIntensity;
      state.backgroundColor = defaults.backgroundColor;
      state.autoRotate = defaults.autoRotate;
      state.autoRotateSpeed = defaults.autoRotateSpeed;
      state.scale = defaults.scale;
      state.wireframe = defaults.wireframe;
    },
  },
});

export const { setVariant, patchViewer, resetVariant, resetTuning } = viewerSlice.actions;
export default viewerSlice.reducer;
export const viewerDefaults = defaults;
