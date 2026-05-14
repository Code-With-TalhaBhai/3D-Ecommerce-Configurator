"use client";

import { Canvas } from "@react-three/fiber";
import {
  Bounds,
  Center,
  Environment,
  OrbitControls,
  useGLTF,
} from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { useAppSelector } from "@/store/hooks";

type ConfigurableViewerProps = {
  src: string;
  className?: string;
  onFirstFrame?: () => void;
  /**
   * Callback that receives a function to capture the canvas as a PNG data URL.
   * Lets the parent wire a Screenshot button without lifting renderer state.
   */
  onScreenshotterReady?: (capture: () => string | null) => void;
};

type Original = {
  color: THREE.Color | null;
  map: THREE.Texture | null;
};

/**
 * Copy the subset of properties that any THREE.Material is guaranteed to have,
 * for the case where the source isn't MeshStandardMaterial (so the built-in
 * `MeshPhysicalMaterial.copy` would crash reading `source.normalScale.x`).
 */
function copyMaterialSafely(target: THREE.MeshPhysicalMaterial, source: THREE.Material) {
  target.name = source.name;
  target.transparent = source.transparent;
  target.opacity = source.opacity;
  target.side = source.side;
  target.visible = source.visible;
  target.depthTest = source.depthTest;
  target.depthWrite = source.depthWrite;
  target.alphaTest = source.alphaTest;

  // Optional fields present on most user-facing materials. Reads via index
  // signature so we don't promise types Three doesn't guarantee.
  const src = source as unknown as Record<string, unknown>;
  if (src.color instanceof THREE.Color) target.color.copy(src.color);
  if (src.map === null || src.map instanceof THREE.Texture) target.map = src.map ?? null;
  if (src.alphaMap === null || src.alphaMap instanceof THREE.Texture) {
    target.alphaMap = src.alphaMap ?? null;
  }
}

function ConfigurableModel({
  src,
  onFirstFrame,
}: {
  src: string;
  onFirstFrame?: () => void;
}) {
  const gltf = useGLTF(src);
  const viewer = useAppSelector((s) => s.viewer);
  // Per-material originals so we can restore color/map when the user clears overrides.
  const originalsRef = useRef<Map<THREE.MeshPhysicalMaterial, Original>>(new Map());

  // First pass — clone every material as MeshPhysicalMaterial (a strict superset of
  // Standard, adds clearcoat), snapshot originals, swap them in.
  useEffect(() => {
    gltf.scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || !obj.material) return;
      const sourceMaterials = Array.isArray(obj.material) ? obj.material : [obj.material];

      const upgraded: THREE.MeshPhysicalMaterial[] = sourceMaterials.map((m) => {
        if (m instanceof THREE.MeshPhysicalMaterial) return m.clone() as THREE.MeshPhysicalMaterial;
        const next = new THREE.MeshPhysicalMaterial();
        // `MeshPhysicalMaterial.copy` walks fields like `normalScale.x` that only
        // exist on MeshStandardMaterial-shaped sources. Anything else (Basic /
        // Lambert / Phong / Toon) needs a hand-rolled subset copy.
        if (m instanceof THREE.MeshStandardMaterial) {
          try {
            next.copy(m);
          } catch {
            copyMaterialSafely(next, m);
          }
        } else {
          copyMaterialSafely(next, m);
        }
        return next;
      });

      for (const mat of upgraded) {
        if (!originalsRef.current.has(mat)) {
          originalsRef.current.set(mat, {
            color: mat.color ? mat.color.clone() : null,
            map: mat.map ?? null,
          });
        }
      }

      obj.material = Array.isArray(obj.material) ? upgraded : upgraded[0];
    });
    onFirstFrame?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gltf.scene]);

  // Helper to iterate every upgraded material with its `Original` snapshot.
  const eachMaterial = (
    cb: (mat: THREE.MeshPhysicalMaterial, originals: Original | undefined) => void,
  ) => {
    gltf.scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || !obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (m instanceof THREE.MeshPhysicalMaterial) {
          cb(m, originalsRef.current.get(m));
        }
      }
    });
  };

  // --- Apply color (override or restore) ---
  useEffect(() => {
    eachMaterial((mat, originals) => {
      if (!mat.color) return;
      if (viewer.color) mat.color.set(viewer.color);
      else if (originals?.color) mat.color.copy(originals.color);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer.color, gltf.scene]);

  // --- Apply roughness / metalness / clearcoat / wireframe ---
  useEffect(() => {
    eachMaterial((mat) => {
      mat.roughness = viewer.roughness;
      mat.metalness = viewer.metalness;
      mat.clearcoat = viewer.clearcoat;
      mat.clearcoatRoughness = 0.1;
      mat.wireframe = viewer.wireframe;
      mat.needsUpdate = true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    viewer.roughness,
    viewer.metalness,
    viewer.clearcoat,
    viewer.wireframe,
    gltf.scene,
  ]);

  // --- Apply emissive color + intensity ---
  useEffect(() => {
    eachMaterial((mat) => {
      if (!mat.emissive) return;
      mat.emissive.set(viewer.emissiveColor);
      mat.emissiveIntensity = viewer.emissiveIntensity;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer.emissiveColor, viewer.emissiveIntensity, gltf.scene]);

  // --- Apply texture (load if URL set, restore original otherwise) + tile ---
  useEffect(() => {
    let cancelled = false;

    function applyMap(map: THREE.Texture | null) {
      eachMaterial((mat, originals) => {
        const next = map ?? originals?.map ?? null;
        mat.map = next;
        if (next) {
          next.wrapS = THREE.RepeatWrapping;
          next.wrapT = THREE.RepeatWrapping;
          next.repeat.set(viewer.textureRepeat, viewer.textureRepeat);
          next.needsUpdate = true;
        }
        mat.needsUpdate = true;
      });
    }

    if (!viewer.textureUrl) {
      applyMap(null);
      return;
    }

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(
      viewer.textureUrl,
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
        if (!cancelled) applyMap(null);
      },
    );

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer.textureUrl, viewer.textureRepeat, gltf.scene]);

  return <primitive object={gltf.scene} />;
}

export function ConfigurableViewer({
  src,
  className,
  onFirstFrame,
  onScreenshotterReady,
}: ConfigurableViewerProps) {
  const viewer = useAppSelector((s) => s.viewer);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  // Stable identity for the screenshot callback.
  const screenshotter = useMemo(() => {
    return () => {
      const dom = rendererRef.current?.domElement;
      if (!dom) return null;
      try {
        return dom.toDataURL("image/png");
      } catch {
        return null;
      }
    };
  }, []);

  useEffect(() => {
    onScreenshotterReady?.(screenshotter);
  }, [onScreenshotterReady, screenshotter]);

  return (
    <div className={className}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [2, 2, 3], fov: 45 }}
        // preserveDrawingBuffer lets us read pixels back for screenshots.
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        onCreated={({ gl }) => {
          rendererRef.current = gl;
        }}
      >
        {viewer.backgroundColor && (
          <color attach="background" args={[viewer.backgroundColor]} />
        )}
        <ambientLight intensity={0.45} />
        <directionalLight position={[5, 5, 5]} intensity={1.1} castShadow />
        <Suspense fallback={null}>
          <Bounds fit clip observe margin={1.2}>
            <Center>
              <group scale={viewer.scale}>
                <ConfigurableModel src={src} onFirstFrame={onFirstFrame} />
              </group>
            </Center>
          </Bounds>
          <Environment
            key={viewer.envPreset}
            preset={viewer.envPreset}
            environmentIntensity={viewer.envIntensity}
          />
        </Suspense>
        <OrbitControls
          makeDefault
          enableDamping
          autoRotate={viewer.autoRotate}
          autoRotateSpeed={viewer.autoRotateSpeed}
        />
      </Canvas>
    </div>
  );
}
