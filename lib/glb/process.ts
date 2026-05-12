import "server-only";

import { NodeIO } from "@gltf-transform/core";
import { KHRDracoMeshCompression } from "@gltf-transform/extensions";
import { draco } from "@gltf-transform/functions";
import draco3d from "draco3dgltf";

import { GLB_MAGIC, MAX_GLB_BYTES, MAX_TRIANGLES } from "./limits";

export type GlbProcessResult =
  | {
      ok: true;
      compressed: Uint8Array;
      stats: {
        originalBytes: number;
        compressedBytes: number;
        triangles: number;
        vertices: number;
        meshes: number;
        materials: number;
      };
    }
  | { ok: false; reason: string };

let ioPromise: Promise<NodeIO> | null = null;
async function getIo() {
  if (!ioPromise) {
    ioPromise = (async () => {
      const [encoder, decoder] = await Promise.all([
        draco3d.createEncoderModule(),
        draco3d.createDecoderModule(),
      ]);
      return new NodeIO()
        .registerExtensions([KHRDracoMeshCompression])
        .registerDependencies({
          "draco3d.decoder": decoder,
          "draco3d.encoder": encoder,
        });
    })();
  }
  return ioPromise;
}

/**
 * Validate, Draco-compress, and gather stats for a GLB.
 * Returns `ok:false` for any user-facing rejection (size, format, poly count, parse failure).
 */
export async function processGlb(input: Uint8Array): Promise<GlbProcessResult> {
  if (input.byteLength > MAX_GLB_BYTES) {
    return { ok: false, reason: `File exceeds the ${Math.round(MAX_GLB_BYTES / 1024 / 1024)} MB limit.` };
  }

  if (input.byteLength < 12) {
    return { ok: false, reason: "File is too small to be a valid GLB." };
  }
  // GLB header: magic 'glTF' (LE u32) + version + length
  const dv = new DataView(input.buffer, input.byteOffset, input.byteLength);
  if (dv.getUint32(0, true) !== GLB_MAGIC) {
    return { ok: false, reason: "Not a valid GLB file (magic header missing)." };
  }

  const io = await getIo();
  let document;
  try {
    document = await io.readBinary(input);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown parse error";
    return { ok: false, reason: `Could not parse GLB: ${msg}` };
  }

  // Count triangles before compression.
  let triangles = 0;
  let vertices = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      const position = prim.getAttribute("POSITION");
      if (indices) {
        triangles += indices.getCount() / 3;
      } else if (position) {
        // Non-indexed triangles
        triangles += position.getCount() / 3;
      }
      if (position) vertices += position.getCount();
    }
  }

  if (triangles > MAX_TRIANGLES) {
    return {
      ok: false,
      reason: `Model has ${Math.round(triangles).toLocaleString()} triangles. Max allowed is ${MAX_TRIANGLES.toLocaleString()}.`,
    };
  }

  try {
    await document.transform(draco({ method: "edgebreaker" }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown compression error";
    return { ok: false, reason: `Draco compression failed: ${msg}` };
  }

  const compressed = await io.writeBinary(document);

  return {
    ok: true,
    compressed,
    stats: {
      originalBytes: input.byteLength,
      compressedBytes: compressed.byteLength,
      triangles: Math.round(triangles),
      vertices,
      meshes: document.getRoot().listMeshes().length,
      materials: document.getRoot().listMaterials().length,
    },
  };
}
