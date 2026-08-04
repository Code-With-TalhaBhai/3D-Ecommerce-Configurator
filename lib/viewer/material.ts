import * as THREE from "three";

import type { Finish } from "@/store/slices/viewerSlice";

// Customer-facing finishes → physical-material numeric values.
// `null` means "leave the original material untouched". Shared between
// ConfigurableViewer (product page) and ARViewer (place-in-room) so both
// surfaces render the same picked finish identically.
export type FinishSpec = { roughness: number; metalness: number; clearcoat: number };
export const FINISH_MAP: Record<Finish, FinishSpec | null> = {
  default: null,
  matte: { roughness: 0.85, metalness: 0, clearcoat: 0 },
  satin: { roughness: 0.5, metalness: 0, clearcoat: 0 },
  glossy: { roughness: 0.15, metalness: 0, clearcoat: 0.3 },
  metallic: { roughness: 0.3, metalness: 0.85, clearcoat: 0.2 },
  polished: { roughness: 0.05, metalness: 0.5, clearcoat: 0.5 },
};

/**
 * MeshPhysicalMaterial.copy() walks fields like `normalScale.x` that only
 * exist on MeshStandardMaterial-shaped sources. For everything else (Basic /
 * Lambert / Phong / Toon) we copy only the universally-safe subset.
 */
export function copyMaterialSafely(target: THREE.MeshPhysicalMaterial, source: THREE.Material) {
  target.name = source.name;
  target.transparent = source.transparent;
  target.opacity = source.opacity;
  target.side = source.side;
  target.visible = source.visible;
  target.depthTest = source.depthTest;
  target.depthWrite = source.depthWrite;
  target.alphaTest = source.alphaTest;

  const src = source as unknown as Record<string, unknown>;
  if (src.color instanceof THREE.Color) target.color.copy(src.color);
  if (src.map === null || src.map instanceof THREE.Texture) target.map = src.map ?? null;
  if (src.alphaMap === null || src.alphaMap instanceof THREE.Texture) {
    target.alphaMap = src.alphaMap ?? null;
  }
}

/** Upgrades one material to MeshPhysicalMaterial (superset of Standard — needed
 * for the clearcoat lobe used by Glossy / Metallic / Polished finishes). */
export function upgradeToPhysical(source: THREE.Material): THREE.MeshPhysicalMaterial {
  if (source instanceof THREE.MeshPhysicalMaterial) {
    return source.clone() as THREE.MeshPhysicalMaterial;
  }
  const next = new THREE.MeshPhysicalMaterial();
  if (source instanceof THREE.MeshStandardMaterial) {
    try {
      next.copy(source);
    } catch {
      copyMaterialSafely(next, source);
    }
  } else {
    copyMaterialSafely(next, source);
  }
  return next;
}

/** Same part-id derivation ConfigurableViewer uses when it discovers parts and
 * dispatches `setParts` — kept in sync here so `partColors` keyed by that id
 * resolve correctly against a freshly-traversed scene (e.g. the AR clone). */
export function derivePartId(materialName: string | undefined, meshName: string, meshUuid: string, index: number) {
  const rawName = (materialName || meshName || "").trim();
  return rawName ? `name:${rawName.toLowerCase()}` : `mesh:${meshUuid}:${index}`;
}
