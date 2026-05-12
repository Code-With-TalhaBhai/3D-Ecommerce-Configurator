"use client";

import { Canvas } from "@react-three/fiber";
import { Bounds, Center, Environment, OrbitControls, useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useRef } from "react";
import * as THREE from "three";

import { useAppSelector } from "@/store/hooks";

type ConfigurableViewerProps = {
  src: string;
  className?: string;
  onFirstFrame?: () => void;
};

function ConfigurableModel({ src, onFirstFrame }: { src: string; onFirstFrame?: () => void }) {
  const gltf = useGLTF(src);
  const variant = useAppSelector((s) => s.viewer);

  // Clone the materials once so our overrides don't bleed into cached gltf scenes.
  const originalsRef = useRef<
    Map<
      THREE.Mesh,
      { color: THREE.Color | null; map: THREE.Texture | null }
    >
  >(new Map());

  useEffect(() => {
    gltf.scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || !obj.material) return;
      if (originalsRef.current.has(obj)) return;
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      const cloned = materials.map((m) => m.clone());
      obj.material = Array.isArray(obj.material) ? cloned : cloned[0];
      const first = cloned[0] as THREE.MeshStandardMaterial;
      originalsRef.current.set(obj, {
        color: first.color ? first.color.clone() : null,
        map: first.map ?? null,
      });
    });
    onFirstFrame?.();
    // Run once per scene; new src remounts via Suspense key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gltf.scene]);

  // Apply color from Redux viewer slice (null = restore original).
  useEffect(() => {
    gltf.scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || !obj.material) return;
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of materials) {
        const mat = m as THREE.MeshStandardMaterial;
        if (!mat.color) continue;
        if (variant.color) {
          mat.color.set(variant.color);
        } else {
          const orig = originalsRef.current.get(obj);
          if (orig?.color) mat.color.copy(orig.color);
        }
      }
    });
  }, [variant.color, gltf.scene]);

  // Apply texture (loads and assigns to material.map; restores original when null).
  useEffect(() => {
    let cancelled = false;

    function applyMap(map: THREE.Texture | null) {
      gltf.scene.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh) || !obj.material) return;
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of materials) {
          const mat = m as THREE.MeshStandardMaterial;
          if ("map" in mat) {
            mat.map = map;
            mat.needsUpdate = true;
          }
        }
      });
    }

    if (!variant.textureUrl) {
      gltf.scene.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const orig = originalsRef.current.get(obj);
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of materials) {
          const mat = m as THREE.MeshStandardMaterial;
          if ("map" in mat) {
            mat.map = orig?.map ?? null;
            mat.needsUpdate = true;
          }
        }
      });
      return;
    }

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(
      variant.textureUrl,
      (texture) => {
        if (cancelled) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.flipY = false; // GLTF convention
        applyMap(texture);
      },
      undefined,
      () => {
        // Texture failed to load; silently revert.
        if (!cancelled) applyMap(null);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [variant.textureUrl, gltf.scene]);

  return <primitive object={gltf.scene} />;
}

export function ConfigurableViewer({ src, className, onFirstFrame }: ConfigurableViewerProps) {
  return (
    <div className={className}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [2, 2, 3], fov: 45 }}
        gl={{ antialias: true }}
      >
        <ambientLight intensity={0.45} />
        <directionalLight position={[5, 5, 5]} intensity={1.1} castShadow />
        <Suspense fallback={null}>
          <Bounds fit clip observe margin={1.2}>
            <Center>
              <ConfigurableModel src={src} onFirstFrame={onFirstFrame} />
            </Center>
          </Bounds>
          <Environment preset="studio" />
        </Suspense>
        <OrbitControls makeDefault enableDamping />
      </Canvas>
    </div>
  );
}
