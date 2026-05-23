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

const MAX_GLB_BYTES = 100 * 1024 * 1024;
const MAX_TEXTURE_BYTES = 2 * 1024 * 1024;
const MAX_VARIANTS = 8;

type FieldErrors = Record<string, string[]>;

type VariantDraft = {
  uid: string;
  color: string;
  material: string;
  texture: File | null;
};

type ProgressStage =
  | "presigning"
  | "uploading_glb"
  | "uploading_textures"
  | "finalizing";

type Progress = { stage: ProgressStage; pct: number };

const STAGE_LABEL: Record<ProgressStage, string> = {
  presigning: "Preparing upload…",
  uploading_glb: "Uploading model",
  uploading_textures: "Uploading variant textures",
  finalizing: "Compressing & saving",
};

type UploadResult = { status: number; text: string };

/**
 * POST a Blob to a same-origin URL with upload-progress reporting. `fetch`
 * doesn't expose upload progress, so we drop to XHR. Resolves with the raw
 * status + body text so the caller can parse JSON and surface server errors.
 */
function postWithProgress(
  url: string,
  body: Blob,
  contentType: string,
  onProgress: (pct: number) => void,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && e.total > 0) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });
    xhr.addEventListener("load", () => {
      resolve({ status: xhr.status, text: xhr.responseText });
    });
    xhr.addEventListener("error", () =>
      reject(new Error("Upload failed. (Network error.)")),
    );
    xhr.addEventListener("abort", () => reject(new Error("Upload aborted.")));
    xhr.send(body);
  });
}

function parseError(text: string, fallback: string): string {
  try {
    const data = JSON.parse(text) as { error?: string };
    return data.error ?? fallback;
  } catch {
    return fallback;
  }
}

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
  const [progress, setProgress] = useState<Progress | null>(null);
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
      setError("File exceeds the 100 MB limit.");
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
    setProgress({ stage: "presigning", pct: 0 });

    const formEl = e.currentTarget;
    const fd = new FormData(formEl);
    const title = String(fd.get("title") ?? "");
    const description = String(fd.get("description") ?? "");
    const price = Number(fd.get("price") ?? 0);
    const stock = Number(fd.get("stock") ?? 0);

    const variantsWithTexture = variants
      .map((v, i) => (v.texture ? { variant: v, index: i, texture: v.texture } : null))
      .filter((x): x is { variant: VariantDraft; index: number; texture: File } => x !== null);

    try {
      // Step 1: get an upload id and chunk-size plan from the server. No
      // presigned URLs — every byte will flow through our same-origin API
      // routes, so the bucket's CORS config is irrelevant to the upload path.
      const initRes = await fetch("/api/vendor/products/upload/init", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fileSize: file.size,
          textures: variantsWithTexture.map(({ index, texture }) => ({
            index,
            size: texture.size,
            contentType: texture.type,
          })),
        }),
      });
      const init = (await initRes.json()) as {
        error?: string;
        uploadId?: string;
        chunkSize?: number;
        totalChunks?: number;
      };
      if (!initRes.ok || !init.uploadId || !init.chunkSize || !init.totalChunks) {
        setError(init.error ?? "Could not initialize upload.");
        return;
      }

      // Step 2: slice the GLB into chunks and POST them sequentially. Each
      // chunk POST is same-origin so there's no CORS surface, and each chunk
      // is below Vercel's request-body cap. GLB upload owns 0–85% of the
      // progress bar.
      const { uploadId, chunkSize, totalChunks } = init;
      setProgress({ stage: "uploading_glb", pct: 0 });
      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);
        const chunkRes = await postWithProgress(
          `/api/vendor/products/upload/chunk?uploadId=${uploadId}&part=${i}`,
          chunk,
          "application/octet-stream",
          (xhrPct) => {
            const overall = ((i + xhrPct / 100) / totalChunks) * 85;
            setProgress({ stage: "uploading_glb", pct: Math.min(85, Math.round(overall)) });
          },
        );
        if (chunkRes.status < 200 || chunkRes.status >= 300) {
          setError(parseError(chunkRes.text, `Chunk ${i + 1} of ${totalChunks} failed.`));
          return;
        }
      }

      // Step 3: POST each variant texture to its own same-origin route.
      // Textures are <2 MB each, so no chunking. 85–95% of the bar.
      const textureKeysByIndex = new Map<number, string>();
      const totalTextures = variantsWithTexture.length;
      let textureIdx = 0;
      for (const { index, texture } of variantsWithTexture) {
        const slotStart = 85 + (textureIdx / Math.max(1, totalTextures)) * 10;
        const slotSize = 10 / Math.max(1, totalTextures);
        setProgress({ stage: "uploading_textures", pct: Math.round(slotStart) });
        const texRes = await postWithProgress(
          `/api/vendor/products/upload/texture?uploadId=${uploadId}&index=${index}`,
          texture,
          texture.type,
          (xhrPct) => {
            setProgress({
              stage: "uploading_textures",
              pct: Math.min(95, Math.round(slotStart + slotSize * (xhrPct / 100))),
            });
          },
        );
        if (texRes.status < 200 || texRes.status >= 300) {
          setError(parseError(texRes.text, `Texture upload failed.`));
          return;
        }
        try {
          const parsed = JSON.parse(texRes.text) as { key?: string };
          if (parsed.key) textureKeysByIndex.set(index, parsed.key);
        } catch {
          // unparseable but 2xx — shouldn't happen, but surface a clear error.
          setError("Texture upload returned an invalid response.");
          return;
        }
        textureIdx++;
      }

      // Step 4: finalize. Server pulls every chunk back from S3, concatenates,
      // runs Draco compression, and creates the Product row. We don't know
      // exactly how long compression takes, so pin the bar at 96% during the
      // call.
      setProgress({ stage: "finalizing", pct: 96 });
      const completeRes = await fetch("/api/vendor/products/upload/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          uploadId,
          totalChunks,
          title,
          description,
          price,
          stock,
          variants: variants.map((v, i) => {
            const entry: {
              color?: string;
              material?: string;
              textureKey?: string;
            } = {};
            if (v.color) entry.color = v.color;
            if (v.material.trim()) entry.material = v.material.trim();
            const tk = textureKeysByIndex.get(i);
            if (tk) entry.textureKey = tk;
            return entry;
          }),
        }),
      });
      const data = (await completeRes.json()) as {
        error?: string;
        fieldErrors?: FieldErrors;
        product?: { id: string };
      };
      if (!completeRes.ok) {
        setError(data.error ?? "Upload failed.");
        if (data.fieldErrors) setFieldErrors(data.fieldErrors);
        return;
      }
      setProgress({ stage: "finalizing", pct: 100 });
      router.push("/vendor/products");
      router.refresh();
    } catch (err) {
      const msg =
        err instanceof Error && err.message ? err.message : "Network error. Please try again.";
      setError(msg);
    } finally {
      setSubmitting(false);
      setProgress(null);
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
          <Label htmlFor="glb">3D model (.glb, max 100 MB)</Label>
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

        {progress && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400">
              <span>{STAGE_LABEL[progress.stage]}</span>
              <span className="font-mono tabular-nums">{progress.pct}%</span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
              role="progressbar"
              aria-valuenow={progress.pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={STAGE_LABEL[progress.stage]}
            >
              <div
                className="h-full bg-zinc-900 transition-[width] duration-150 ease-out dark:bg-zinc-100"
                style={{ width: `${progress.pct}%` }}
              />
            </div>
          </div>
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
