"use client";

/**
 * Ephemeral, session-only UK shoe size picker shown inside the try-on
 * overlay. Deliberately not persisted anywhere (not Redux, not the product
 * schema, not the cart) — consistent with this codebase's existing rule that
 * configurator customizations are visual previews only. Drives the real-world
 * reference length used for foot depth estimation and GLB scaling; see
 * UK_SIZE_REFERENCE_CM / UK_SIZE_STEP_CM in lib/viewer/tryon/constants.ts.
 */

const UK_SIZES = [4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 12];

export function SizePicker({ value, onChange }: { value: number; onChange: (size: number) => void }) {
  return (
    <div className="pointer-events-auto flex flex-col items-center gap-1.5">
      <p className="rounded-full bg-black/55 px-3 py-1 text-[11px] font-medium text-white backdrop-blur-md">
        Shoe size (UK)
      </p>
      <div className="flex max-w-[min(90vw,320px)] flex-wrap justify-center gap-1 rounded-2xl bg-black/55 p-1.5 backdrop-blur-md">
        {UK_SIZES.map((size) => (
          <button
            key={size}
            type="button"
            onClick={() => onChange(size)}
            className={`min-w-[34px] rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${
              value === size ? "bg-white text-zinc-900" : "text-white active:bg-white/20"
            }`}
          >
            {size}
          </button>
        ))}
      </div>
    </div>
  );
}
