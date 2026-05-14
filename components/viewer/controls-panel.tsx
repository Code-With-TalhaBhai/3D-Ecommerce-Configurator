"use client";

import {
  Camera,
  Eraser,
  Maximize2,
  Paintbrush,
  RotateCcw,
  Sun,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  ENV_PRESETS,
  patchViewer,
  resetTuning,
  type EnvPreset,
} from "@/store/slices/viewerSlice";

type Tab = "material" | "scene" | "view";

const TAB_LABELS: Record<Tab, { label: string; icon: typeof Paintbrush }> = {
  material: { label: "Material", icon: Paintbrush },
  scene: { label: "Scene", icon: Sun },
  view: { label: "View", icon: Maximize2 },
};

export function ControlsPanel({
  takeScreenshot,
  productTitle,
}: {
  takeScreenshot: () => string | null;
  productTitle: string;
}) {
  const dispatch = useAppDispatch();
  const viewer = useAppSelector((s) => s.viewer);
  const [tab, setTab] = useState<Tab>("material");

  function onScreenshot() {
    const data = takeScreenshot();
    if (!data) return;
    const a = document.createElement("a");
    a.href = data;
    a.download = `${slugify(productTitle)}-3d.png`;
    a.click();
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
        <nav className="flex items-center gap-1">
          {(Object.entries(TAB_LABELS) as [Tab, (typeof TAB_LABELS)[Tab]][]).map(
            ([key, { label, icon: Icon }]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                  tab === key
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ),
          )}
        </nav>
        <button
          type="button"
          onClick={() => dispatch(resetTuning())}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          title="Reset all sliders to defaults"
        >
          <RotateCcw className="h-3 w-3" /> Reset
        </button>
      </div>

      <div className="px-4 py-4">
        {tab === "material" && (
          <MaterialControls
            color={viewer.color}
            roughness={viewer.roughness}
            metalness={viewer.metalness}
            emissiveColor={viewer.emissiveColor}
            emissiveIntensity={viewer.emissiveIntensity}
            clearcoat={viewer.clearcoat}
            textureRepeat={viewer.textureRepeat}
            hasTexture={!!viewer.textureUrl}
            onChange={(patch) => dispatch(patchViewer(patch))}
          />
        )}
        {tab === "scene" && (
          <SceneControls
            envPreset={viewer.envPreset}
            envIntensity={viewer.envIntensity}
            backgroundColor={viewer.backgroundColor}
            autoRotate={viewer.autoRotate}
            autoRotateSpeed={viewer.autoRotateSpeed}
            onChange={(patch) => dispatch(patchViewer(patch))}
          />
        )}
        {tab === "view" && (
          <ViewControls
            scale={viewer.scale}
            wireframe={viewer.wireframe}
            onChange={(patch) => dispatch(patchViewer(patch))}
            onScreenshot={onScreenshot}
          />
        )}
      </div>

      <p className="border-t border-zinc-200 px-4 py-2 text-[11px] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        Customizations are visual previews. Cart item ships with the vendor variant you picked above.
      </p>
    </div>
  );
}

function MaterialControls({
  color,
  roughness,
  metalness,
  emissiveColor,
  emissiveIntensity,
  clearcoat,
  textureRepeat,
  hasTexture,
  onChange,
}: {
  color: string | null;
  roughness: number;
  metalness: number;
  emissiveColor: string;
  emissiveIntensity: number;
  clearcoat: number;
  textureRepeat: number;
  hasTexture: boolean;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Label>Base color</Label>
        <div className="flex items-center gap-2">
          <ColorSwatch
            value={color ?? "#ffffff"}
            onChange={(c) => onChange({ color: c })}
          />
          {color && (
            <button
              type="button"
              onClick={() => onChange({ color: null })}
              className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              <Eraser className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
      </div>

      <Slider
        label="Roughness"
        value={roughness}
        min={0}
        max={1}
        step={0.01}
        hint={describeRoughness(roughness)}
        onChange={(v) => onChange({ roughness: v })}
      />
      <Slider
        label="Metalness"
        value={metalness}
        min={0}
        max={1}
        step={0.01}
        hint={describeMetalness(metalness)}
        onChange={(v) => onChange({ metalness: v })}
      />
      <Slider
        label="Clearcoat"
        value={clearcoat}
        min={0}
        max={1}
        step={0.01}
        hint={clearcoat > 0 ? "Glossy top layer" : "Off"}
        onChange={(v) => onChange({ clearcoat: v })}
      />

      <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
        <div className="mb-3 flex items-center justify-between">
          <Label>Emissive glow</Label>
          <div className="flex items-center gap-2">
            <ColorSwatch
              value={emissiveColor}
              onChange={(c) => onChange({ emissiveColor: c })}
            />
          </div>
        </div>
        <Slider
          label="Intensity"
          value={emissiveIntensity}
          min={0}
          max={2}
          step={0.05}
          hint={emissiveIntensity === 0 ? "Off" : `×${emissiveIntensity.toFixed(2)}`}
          onChange={(v) => onChange({ emissiveIntensity: v })}
        />
      </div>

      {hasTexture && (
        <Slider
          label="Texture tile"
          value={textureRepeat}
          min={0.5}
          max={8}
          step={0.1}
          hint={`${textureRepeat.toFixed(1)}× tiling`}
          onChange={(v) => onChange({ textureRepeat: v })}
        />
      )}
    </div>
  );
}

function SceneControls({
  envPreset,
  envIntensity,
  backgroundColor,
  autoRotate,
  autoRotateSpeed,
  onChange,
}: {
  envPreset: EnvPreset;
  envIntensity: number;
  backgroundColor: string | null;
  autoRotate: boolean;
  autoRotateSpeed: number;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label>HDR environment</Label>
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
          {ENV_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onChange({ envPreset: p })}
              className={cn(
                "rounded-md border px-2 py-1.5 text-[11px] font-medium capitalize transition-colors",
                envPreset === p
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                  : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-zinc-600",
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <Slider
        label="Environment intensity"
        value={envIntensity}
        min={0}
        max={2}
        step={0.05}
        hint={`×${envIntensity.toFixed(2)}`}
        onChange={(v) => onChange({ envIntensity: v })}
      />

      <div className="flex items-center justify-between gap-3">
        <Label>Background</Label>
        <div className="flex items-center gap-2">
          {backgroundColor ? (
            <>
              <ColorSwatch
                value={backgroundColor}
                onChange={(c) => onChange({ backgroundColor: c })}
              />
              <button
                type="button"
                onClick={() => onChange({ backgroundColor: null })}
                className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                <Eraser className="h-3 w-3" /> Clear
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onChange({ backgroundColor: "#0a0a0a" })}
              className="rounded-md border border-dashed border-zinc-300 px-2 py-1 text-[11px] text-zinc-600 hover:border-zinc-500 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:text-zinc-100"
            >
              Set color
            </button>
          )}
        </div>
      </div>

      <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
        <Toggle
          label="Auto-rotate"
          checked={autoRotate}
          onChange={(v) => onChange({ autoRotate: v })}
        />
        {autoRotate && (
          <div className="mt-3">
            <Slider
              label="Rotation speed"
              value={autoRotateSpeed}
              min={0.5}
              max={5}
              step={0.1}
              hint={`${autoRotateSpeed.toFixed(1)}×`}
              onChange={(v) => onChange({ autoRotateSpeed: v })}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ViewControls({
  scale,
  wireframe,
  onChange,
  onScreenshot,
}: {
  scale: number;
  wireframe: boolean;
  onChange: (patch: Record<string, unknown>) => void;
  onScreenshot: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Slider
        label="Scale"
        value={scale}
        min={0.5}
        max={2}
        step={0.05}
        hint={`${scale.toFixed(2)}×`}
        onChange={(v) => onChange({ scale: v })}
      />
      <Toggle
        label="Wireframe"
        checked={wireframe}
        onChange={(v) => onChange({ wireframe: v })}
        hint="Show the underlying mesh topology."
      />
      <Button type="button" variant="secondary" onClick={onScreenshot} className="self-start">
        <Camera className="h-4 w-4" /> Save snapshot
      </Button>
    </div>
  );
}

// --- primitives ---

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
      {children}
    </label>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  hint?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
          {label}
        </span>
        {hint && (
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{hint}</span>
        )}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-200 accent-zinc-900 dark:bg-zinc-800 dark:accent-zinc-100"
      />
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="flex items-start justify-between gap-3">
      <span className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
          {label}
        </span>
        {hint && (
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{hint}</span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border transition-colors",
          checked
            ? "border-zinc-900 bg-zinc-900 dark:border-zinc-100 dark:bg-zinc-100"
            : "border-zinc-300 bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all dark:bg-zinc-900",
            checked ? "left-[18px]" : "left-0.5",
          )}
        />
      </button>
    </label>
  );
}

function ColorSwatch({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label
      className="relative inline-flex h-7 w-12 cursor-pointer items-center justify-center rounded-md border border-zinc-300 dark:border-zinc-700"
      style={{ backgroundColor: value }}
      title="Pick color"
    >
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </label>
  );
}

function describeRoughness(v: number) {
  if (v < 0.15) return "Mirror polished";
  if (v < 0.35) return "Glossy";
  if (v < 0.65) return "Satin";
  if (v < 0.85) return "Matte";
  return "Chalky";
}

function describeMetalness(v: number) {
  if (v < 0.1) return "Non-metallic";
  if (v < 0.5) return "Coated";
  if (v < 0.9) return "Metallic";
  return "Pure metal";
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "snapshot";
}
