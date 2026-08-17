"use client";

import { useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

import { useAppSelector } from "@/store/hooks";
import { FINISH_MAP, derivePartId, upgradeToPhysical } from "@/lib/viewer/material";

/**
 * Builds a customer-styled clone of the product's GLTF scene for AR (both the
 * WebXR "place in room" flow and the camera-landmark try-on flow).
 *
 * useGLTF caches the parsed scene by URL, and the main ConfigurableViewer
 * (still mounted behind whichever AR overlay is active) mutates that same
 * shared scene's mesh materials in place. Cloning here decouples the two —
 * without it, both viewers would fight over the same material instances. The
 * clone carries over whatever look (color / per-part color / finish / vendor
 * texture) the customer had selected in the configurator, since both read
 * from the same `viewer` Redux slice.
 */
export function useStyledScene(src: string) {
  const gltf = useGLTF(src);
  const viewer = useAppSelector((s) => s.viewer);

  const { scene, floorOffset, materials } = useMemo(() => {
    const cloned = gltf.scene.clone(true);
    const meshMaterials: THREE.MeshPhysicalMaterial[] = [];

    cloned.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || !obj.material) return;
      const sourceMaterials = Array.isArray(obj.material) ? obj.material : [obj.material];
      const upgraded = sourceMaterials.map((m, i) => {
        const mat = upgradeToPhysical(m);
        const partId = derivePartId(m.name, obj.name, obj.uuid, i);
        const colorOverride = viewer.partColors[partId] ?? viewer.color;
        if (colorOverride && mat.color) {
          mat.color.set(colorOverride);
          mat.map = null; // a tinted base map would fight the picked color
        }
        const spec = FINISH_MAP[viewer.finish];
        if (spec) {
          mat.roughness = spec.roughness;
          mat.metalness = spec.metalness;
          mat.clearcoat = spec.clearcoat;
          mat.clearcoatRoughness = 0.1;
        }
        mat.needsUpdate = true;
        meshMaterials.push(mat);
        return mat;
      });
      obj.material = Array.isArray(obj.material) ? upgraded : upgraded[0];
    });

    // Real-world placement should rest the model's base on the surface the
    // customer tapped, regardless of where the GLB's own origin sits.
    const box = new THREE.Box3().setFromObject(cloned);
    const offset = box.isEmpty() ? 0 : -box.min.y;

    return { scene: cloned, floorOffset: offset, materials: meshMaterials };
  }, [gltf.scene, viewer.color, viewer.partColors, viewer.finish]);

  // Vendor-variant texture swap — mirrors ConfigurableViewer's texture
  // effect, trimmed to a one-shot apply (this scene clone is fresh per AR
  // session, so there's no "restore original" path to maintain).
  useEffect(() => {
    if (!viewer.textureUrl) return;
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(viewer.textureUrl, (texture) => {
      if (cancelled) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = false;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      for (const mat of materials) {
        mat.map = texture;
        mat.needsUpdate = true;
      }
    });
    return () => {
      cancelled = true;
    };
  }, [viewer.textureUrl, materials]);

  return { scene, floorOffset, materials };
}
