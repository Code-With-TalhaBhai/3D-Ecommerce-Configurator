"use client";

import { Camera, RotateCcw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  patchViewer,
  resetTuning,
  type Finish,
  type LightingPreset,
} from "@/store/slices/viewerSlice";

const PALETTE: { label: string; hex: string }[] = [
  { label: "White", hex: "#f5f5f5" },
  { label: "Black", hex: "#1a1a1a" },
  { label: "Charcoal", hex: "#3a3a3a" },
  { label: "Sand", hex: "#d9c8a8" },
  { label: "Sage", hex: "#8fa896" },
  { label: "Slate", hex: "#5a7a9a" },
  { label: "Wine", hex: "#7a2e3a" },
  { label: "Olive", hex: "#6a7240" },
];

const FINISH_OPTIONS: { value: Finish; label: string; hint: string }[] = [
  { value: "default", label: "Original", hint: "As designed" },
  { value: "matte", label: "Matte", hint: "Soft, no shine" },
  { value: "satin", label: "Satin", hint: "Gentle sheen" },
  { value: "glossy", label: "Glossy", hint: "Reflective" },
  { value: "metallic", label: "Metallic", hint: "Brushed metal" },
  { value: "polished", label: "Polished", hint: "Mirror-like" },
];

const LIGHTING_OPTIONS: { value: LightingPreset; label: string; hint: string }[] = [
  { value: "studio", label: "Studio", hint: "Clean & neutral" },
  { value: "daylight", label: "Daylight", hint: "Warm sun" },
  { value: "showroom", label: "Showroom", hint: "Bright" },
  { value: "cozy", label: "Cozy", hint: "Warm indoor" },
  { value: "evening", label: "Evening", hint: "Soft & dim" },
];

const BACKDROP_PRESETS: { label: string; value: string | null }[] = [
  { label: "None", value: null },
  { label: "White", value: "#f5f5f5" },
  { label: "Gray", value: "#bababa" },
  { label: "Charcoal", value: "#1a1a1a" },
];

export function ControlsPanel({
  takeScreenshot,
  productTitle,
}: {
  takeScreenshot: () => string | null;
  productTitle: string;
}) {
  const dispatch = useAppDispatch();
  const viewer = useAppSelector((s) => s.viewer);

  function onScreenshot() {
    const data = takeScreenshot();
    if (!data) return;
    const a = document.createElement("a");
    a.href = data;
    a.download = `${slugify(productTitle)}-3d.png`;
    a.click();
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm shadow-zinc-900/[0.03] dark:border-zinc-800/80 dark:bg-zinc-900 dark:shadow-none">
      <header className="flex items-center justify-between border-b border-zinc-200/80 px-5 py-3.5 dark:border-zinc-800/80">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            <Sparkles className="h-3 w-3" />
          </span>
          <h2 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Personalize the view
          </h2>
        </div>
        <button
          type="button"
          onClick={() => dispatch(resetTuning())}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          title="Reset finish, lighting, backdrop, and spin"
        >
          <RotateCcw className="h-3 w-3" /> Reset
        </button>
      </header>

      <div className="flex flex-col divide-y divide-zinc-200/70 dark:divide-zinc-800/70">
        <Section title="Color" hint="Pick a custom color or one of the swatches.">
          <ColorRow
            value={viewer.color}
            onChange={(c) => dispatch(patchViewer({ color: c }))}
          />
        </Section>

        <Section title="Finish" hint="How the surface catches light.">
          <OptionGrid
            options={FINISH_OPTIONS}
            active={viewer.finish}
            onSelect={(v) => dispatch(patchViewer({ finish: v as Finish }))}
          />
        </Section>

        <Section title="Lighting" hint="Imagine it in different rooms.">
          <OptionGrid
            options={LIGHTING_OPTIONS}
            active={viewer.lighting}
            onSelect={(v) => dispatch(patchViewer({ lighting: v as LightingPreset }))}
          />
        </Section>

        <Section title="Backdrop" hint="Preview against your wall color.">
          <BackdropRow
            value={viewer.backgroundColor}
            onChange={(c) => dispatch(patchViewer({ backgroundColor: c }))}
          />
        </Section>

        <Section title="Spin">
          <Toggle
            label="Auto-spin to see every angle"
            checked={viewer.autoRotate}
            onChange={(v) => dispatch(patchViewer({ autoRotate: v }))}
          />
        </Section>

        <Section title="Save a photo" hint="Capture the current view as an image.">
          <Button type="button" variant="secondary" onClick={onScreenshot} size="sm">
            <Camera className="h-3.5 w-3.5" /> Save snapshot
          </Button>
        </Section>
      </div>

      <p className="border-t border-zinc-200/80 bg-zinc-50/60 px-5 py-2.5 text-[11px] leading-relaxed text-zinc-500 dark:border-zinc-800/80 dark:bg-zinc-950/40 dark:text-zinc-400">
        Customization here is for preview. Your order ships with the vendor variant you picked above.
      </p>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="px-5 py-4">
      <div className="mb-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-700 dark:text-zinc-300">
          {title}
        </h3>
        {hint && (
          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">{hint}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function ColorRow({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={cn(
          "rounded-full border px-3 py-1 text-xs font-medium tracking-tight transition-colors",
          value === null
            ? "border-zinc-900 bg-zinc-900 text-white shadow-sm shadow-zinc-900/20 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 dark:shadow-none"
            : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600",
        )}
      >
        Original
      </button>
      {PALETTE.map((p) => {
        const active = value?.toLowerCase() === p.hex.toLowerCase();
        return (
          <button
            key={p.hex}
            type="button"
            onClick={() => onChange(p.hex)}
            title={p.label}
            aria-label={p.label}
            className={cn(
              "h-8 w-8 rounded-full border shadow-inner ring-offset-2 ring-offset-white transition-all duration-150 dark:ring-offset-zinc-900",
              active
                ? "scale-110 ring-2 ring-zinc-900 border-transparent dark:ring-zinc-100"
                : "border-zinc-200 hover:scale-105 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500",
            )}
            style={{ backgroundColor: p.hex }}
          />
        );
      })}
      <label
        className="relative inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-dashed border-zinc-300 text-zinc-500 transition-colors hover:border-zinc-500 hover:text-zinc-800 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-200"
        title="Custom color"
        style={
          value && !PALETTE.some((p) => p.hex.toLowerCase() === value.toLowerCase())
            ? { backgroundColor: value, borderStyle: "solid", color: "transparent" }
            : undefined
        }
      >
        <span className="text-sm leading-none">+</span>
        <input
          type="color"
          value={value ?? "#888888"}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}

function OptionGrid<T extends string>({
  options,
  active,
  onSelect,
}: {
  options: { value: T; label: string; hint: string }[];
  active: T;
  onSelect: (value: T) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {options.map((opt) => {
        const isActive = active === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onSelect(opt.value)}
            className={cn(
              "flex flex-col items-start rounded-lg border px-3 py-2.5 text-left transition-all duration-150",
              isActive
                ? "border-zinc-900 bg-zinc-900 text-white shadow-sm shadow-zinc-900/20 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 dark:shadow-none"
                : "border-zinc-200 bg-white text-zinc-900 hover:-translate-y-0.5 hover:border-zinc-400 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:border-zinc-600",
            )}
          >
            <span className="text-xs font-semibold tracking-tight">{opt.label}</span>
            <span
              className={cn(
                "text-[10px]",
                isActive
                  ? "text-zinc-300 dark:text-zinc-600"
                  : "text-zinc-500 dark:text-zinc-400",
              )}
            >
              {opt.hint}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function BackdropRow({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const isPreset = BACKDROP_PRESETS.some(
    (b) => b.value?.toLowerCase() === value?.toLowerCase(),
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      {BACKDROP_PRESETS.map((b) => {
        const active =
          (b.value === null && value === null) ||
          (b.value && b.value.toLowerCase() === value?.toLowerCase());
        return (
          <button
            key={b.label}
            type="button"
            onClick={() => onChange(b.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium tracking-tight transition-colors",
              active
                ? "border-zinc-900 bg-zinc-900 text-white shadow-sm shadow-zinc-900/20 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 dark:shadow-none"
                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600",
            )}
          >
            {b.value && (
              <span
                className="h-3 w-3 rounded-full border border-black/20 dark:border-white/20"
                style={{ backgroundColor: b.value }}
              />
            )}
            <span>{b.label}</span>
          </button>
        );
      })}
      <label
        className="relative inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-500 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:text-zinc-100"
        title="Custom backdrop color"
      >
        {value && !isPreset && (
          <span
            className="h-3 w-3 rounded-full border border-black/20 dark:border-white/20"
            style={{ backgroundColor: value }}
          />
        )}
        <span>Custom</span>
        <input
          type="color"
          value={value && !isPreset ? value : "#cccccc"}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
        {label}
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
            "absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-all dark:bg-zinc-900",
            checked ? "left-[18px]" : "left-0.5",
          )}
        />
      </button>
    </label>
  );
}

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "snapshot"
  );
}
