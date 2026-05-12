// Vendor upload constraints (AGENTS.md §3.2).
export const MAX_GLB_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_TRIANGLES = 100_000;
export const ACCEPTED_MIME = new Set([
  "model/gltf-binary",
  "application/octet-stream", // browsers vary; we still sniff magic bytes
]);
export const ACCEPTED_EXT = new Set([".glb"]);

export const GLB_MAGIC = 0x46546c67; // "glTF" little-endian
