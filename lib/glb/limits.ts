// Vendor upload constraints (AGENTS.md §3.2).
export const MAX_GLB_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_TRIANGLES = 2_000_000;
export const ACCEPTED_MIME = new Set([
  "model/gltf-binary",
  "application/octet-stream", // browsers vary; we still sniff magic bytes
]);
export const ACCEPTED_EXT = new Set([".glb"]);

export const GLB_MAGIC = 0x46546c67; // "glTF" little-endian

// Variant texture constraints
export const MAX_TEXTURE_BYTES = 2 * 1024 * 1024; // 2 MB
export const MAX_VARIANTS = 8;
export const ACCEPTED_TEXTURE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
