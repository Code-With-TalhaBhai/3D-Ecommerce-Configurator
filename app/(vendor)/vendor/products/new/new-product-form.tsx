"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const GlbViewer = dynamic(
  () => import("@/components/viewer/glb-viewer").then((m) => m.GlbViewer),
  { ssr: false, loading: () => <ViewerSkeleton message="Loading viewer…" /> },
);

const MAX_GLB_BYTES = 50 * 1024 * 1024;
const MAX_TEXTURE_BYTES = 2 * 1024 * 1024;
const MAX_VARIANTS = 8;

type FieldErrors = Record<string, string[]>;

type VariantDraft = {
  uid: string;
  color: string;
  material: string;
  texture: File | null;
};

function newVariant(): VariantDraft {
  return {
    uid: crypto.randomUUID(),
    color: "#cccccc",
    material: "",
    texture: null,
  };
}

export function NewProductForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [variants, setVariants] = useState<VariantDraft[]>([]);

  // Manage blob URL lifecycle so we don't leak memory across selections.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const sizeLabel = useMemo(() => {
    if (!file) return null;
    const mb = file.size / 1024 / 1024;
    return `${mb.toFixed(2)} MB`;
  }, [file]);

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setError(null);
    if (!f) {
      setFile(null);
      return;
    }
    if (!f.name.toLowerCase().endsWith(".glb")) {
      setError("Only .glb files are supported.");
      setFile(null);
      e.target.value = "";
      return;
    }
    if (f.size > MAX_GLB_BYTES) {
      setError("File exceeds the 50 MB limit.");
      setFile(null);
      e.target.value = "";
      return;
    }
    setFile(f);
  }

  function addVariant() {
    setVariants((prev) => [...prev, newVariant()]);
  }

  function updateVariant(uid: string, patch: Partial<Omit<VariantDraft, "uid">>) {
    setVariants((prev) =>
      prev.map((v) => (v.uid === uid ? { ...v, ...patch } : v)),
    );
  }

  function removeVariant(uid: string) {
    setVariants((prev) => prev.filter((v) => v.uid !== uid));
  }

  function onTextureChange(uid: string, e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) {
      updateVariant(uid, { texture: null });
      return;
    }
    if (f.size > MAX_TEXTURE_BYTES) {
      setError("Each texture must be 2 MB or smaller.");
      e.target.value = "";
      return;
    }
    setError(null);
    updateVariant(uid, { texture: f });
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) {
      setError("Please choose a GLB file.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const formData = new FormData(e.currentTarget);
    formData.set("glb", file);

    // Serialize variants as JSON + attach texture files under predictable keys.
    if (variants.length > 0) {
      const meta = variants.map((v, i) => {
        const entry: { color?: string; material?: string; textureKey?: string } = {};
        if (v.color) entry.color = v.color;
        if (v.material.trim()) entry.material = v.material.trim();
        if (v.texture) {
          const key = `texture_${i}`;
          entry.textureKey = key;
          formData.set(key, v.texture);
        }
        return entry;
      });
      formData.set("variants", JSON.stringify(meta));
    }

    try {
      const res = await fetch("/api/vendor/products/upload", {
        method: "POST",
        body: formData,
      });
      const data = (await res.json()) as {
        error?: string;
        fieldErrors?: FieldErrors;
        product?: { id: string };
      };
      if (!res.ok) {
        setError(data.error ?? "Upload failed.");
        if (data.fieldErrors) setFieldErrors(data.fieldErrors);
        return;
      }
      router.push("/vendor/products");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1fr,1fr]">
      <div className="flex flex-col gap-5 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" required minLength={2} maxLength={120} disabled={submitting} />
          {fieldErrors.title && <p className="text-xs text-red-600">{fieldErrors.title[0]}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="description">Description</Label>
          <textarea
            id="description"
            name="description"
            required
            minLength={10}
            maxLength={5000}
            rows={4}
            disabled={submitting}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:ring-zinc-100"
          />
          {fieldErrors.description && (
            <p className="text-xs text-red-600">{fieldErrors.description[0]}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="price">Price (USD)</Label>
            <Input id="price" name="price" type="number" step="0.01" min="0" required disabled={submitting} />
            {fieldErrors.price && <p className="text-xs text-red-600">{fieldErrors.price[0]}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="stock">Stock</Label>
            <Input id="stock" name="stock" type="number" min="0" required disabled={submitting} />
            {fieldErrors.stock && <p className="text-xs text-red-600">{fieldErrors.stock[0]}</p>}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="glb">3D model (.glb, max 50 MB)</Label>
          <Input
            id="glb"
            name="glb-input"
            type="file"
            accept=".glb,model/gltf-binary"
            onChange={onFileChange}
            required
            disabled={submitting}
            className="cursor-pointer file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-zinc-800 dark:file:bg-zinc-100 dark:file:text-zinc-900 dark:hover:file:bg-zinc-200"
          />
          {sizeLabel && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {file?.name} · {sizeLabel}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-zinc-200 pt-5 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <div>
              <Label className="mb-0">Variants (optional)</Label>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Color, material, and texture options customers can swap in 3D.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={addVariant}
              disabled={submitting || variants.length >= MAX_VARIANTS}
            >
              <Plus className="h-3.5 w-3.5" /> Add variant
            </Button>
          </div>

          {variants.length > 0 && (
            <ul className="flex flex-col gap-2">
              {variants.map((v, i) => (
                <li
                  key={v.uid}
                  className="grid grid-cols-[auto,1fr,1fr,auto] items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <label
                    className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-zinc-300 dark:border-zinc-700"
                    style={{ backgroundColor: v.color }}
                    title="Pick color"
                  >
                    <input
                      type="color"
                      value={v.color}
                      onChange={(e) => updateVariant(v.uid, { color: e.target.value })}
                      disabled={submitting}
                      className="h-full w-full cursor-pointer opacity-0"
                    />
                  </label>
                  <Input
                    placeholder={`Material #${i + 1} (e.g. leather)`}
                    value={v.material}
                    onChange={(e) => updateVariant(v.uid, { material: e.target.value })}
                    maxLength={60}
                    disabled={submitting}
                    className="h-9"
                  />
                  <Input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => onTextureChange(v.uid, e)}
                    disabled={submitting}
                    className="h-9 cursor-pointer file:mr-2 file:rounded file:border-0 file:bg-zinc-900 file:px-2 file:py-1 file:text-[10px] file:font-medium file:text-white dark:file:bg-zinc-100 dark:file:text-zinc-900"
                  />
                  <button
                    type="button"
                    onClick={() => removeVariant(v.uid)}
                    disabled={submitting}
                    className={cn(
                      "rounded-md p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-700",
                      "disabled:cursor-not-allowed disabled:opacity-50",
                      "dark:text-zinc-400 dark:hover:bg-red-950/40 dark:hover:text-red-300",
                    )}
                    aria-label="Remove variant"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}

        <Button type="submit" disabled={!file || submitting}>
          {submitting ? "Uploading & compressing…" : "Submit for review"}
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Preview</Label>
        <div className="aspect-square overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
          {previewUrl ? (
            <GlbViewer src={previewUrl} className="h-full w-full" />
          ) : (
            <ViewerSkeleton message="Select a .glb file to preview here" />
          )}
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Drag to rotate, scroll to zoom. Server-side Draco compression runs after submission.
        </p>
      </div>
    </form>
  );
}

function ViewerSkeleton({ message }: { message: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-zinc-400">
      {message}
    </div>
  );
}
