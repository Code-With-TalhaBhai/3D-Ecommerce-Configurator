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
import type { Finish, LightingPreset } from "@/store/slices/viewerSlice";

type ConfigurableViewerProps = {
  src: string;
  className?: string;
  onFirstFrame?: () => void;
  /**
   * Receives a function the parent can call to capture the canvas as a PNG
   * data URL. Lets the parent wire a Save-photo button without lifting state.
   */
  onScreenshotterReady?: (capture: () => string | null) => void;
};

type Original = {
  color: THREE.Color | null;
  map: THREE.Texture | null;
  roughness: number;
  metalness: number;
  clearcoat: number;
};

// Customer-facing finishes → physical-material numeric values.
// `null` means "leave the original material untouched".
type FinishSpec = { roughness: number; metalness: number; clearcoat: number };
const FINISH_MAP: Record<Finish, FinishSpec | null> = {
  default: null,
  matte: { roughness: 0.85, metalness: 0, clearcoat: 0 },
  satin: { roughness: 0.5, metalness: 0, clearcoat: 0 },
  glossy: { roughness: 0.15, metalness: 0, clearcoat: 0.3 },
  metallic: { roughness: 0.3, metalness: 0.85, clearcoat: 0.2 },
  polished: { roughness: 0.05, metalness: 0.5, clearcoat: 0.5 },
};

// Customer-facing lighting moods → drei HDR preset names.
const LIGHTING_TO_DREI: Record<
  LightingPreset,
  "studio" | "sunset" | "warehouse" | "lobby" | "apartment"
> = {
  studio: "studio",
  daylight: "sunset",
  showroom: "warehouse",
  cozy: "lobby",
  evening: "apartment",
};

/**
 * MeshPhysicalMaterial.copy() walks fields like `normalScale.x` that only
 * exist on MeshStandardMaterial-shaped sources. For everything else (Basic /
 * Lambert / Phong / Toon) we copy only the universally-safe subset.
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
  // Per-material originals so we can restore color / map / finish when the
  // user picks "Default" / "Original".
  const originalsRef = useRef<Map<THREE.MeshPhysicalMaterial, Original>>(new Map());

  // Upgrade every cloned material to MeshPhysicalMaterial (superset of Standard
  // — supports the clearcoat lobe used by Glossy / Metallic / Polished finishes).
  useEffect(() => {
    gltf.scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || !obj.material) return;
      const sourceMaterials = Array.isArray(obj.material) ? obj.material : [obj.material];

      const upgraded: THREE.MeshPhysicalMaterial[] = sourceMaterials.map((m) => {
        if (m instanceof THREE.MeshPhysicalMaterial) return m.clone() as THREE.MeshPhysicalMaterial;
        const next = new THREE.MeshPhysicalMaterial();
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
            roughness: mat.roughness,
            metalness: mat.metalness,
            clearcoat: mat.clearcoat,
          });
        }
      }

      obj.material = Array.isArray(obj.material) ? upgraded : upgraded[0];
    });
    onFirstFrame?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gltf.scene]);

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

  // --- Apply finish (preset → roughness/metalness/clearcoat, or restore) ---
  useEffect(() => {
    const spec = FINISH_MAP[viewer.finish];
    eachMaterial((mat, originals) => {
      if (spec) {
        mat.roughness = spec.roughness;
        mat.metalness = spec.metalness;
        mat.clearcoat = spec.clearcoat;
        mat.clearcoatRoughness = 0.1;
      } else if (originals) {
        mat.roughness = originals.roughness;
        mat.metalness = originals.metalness;
        mat.clearcoat = originals.clearcoat;
      }
      mat.needsUpdate = true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer.finish, gltf.scene]);

  // --- Apply texture (load if URL set, restore original otherwise) ---
  useEffect(() => {
    let cancelled = false;

    function applyMap(map: THREE.Texture | null) {
      eachMaterial((mat, originals) => {
        const next = map ?? originals?.map ?? null;
        mat.map = next;
        if (next) {
          next.wrapS = THREE.RepeatWrapping;
          next.wrapT = THREE.RepeatWrapping;
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
  }, [viewer.textureUrl, gltf.scene]);

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

  const dreiPreset = LIGHTING_TO_DREI[viewer.lighting];

  return (
    <div className={className}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [2, 2, 3], fov: 45 }}
        // preserveDrawingBuffer lets us read pixels back for the Save-photo button.
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
              <ConfigurableModel src={src} onFirstFrame={onFirstFrame} />
            </Center>
          </Bounds>
          <Environment key={dreiPreset} preset={dreiPreset} />
        </Suspense>
        <OrbitControls
          makeDefault
          enableDamping
          autoRotate={viewer.autoRotate}
          autoRotateSpeed={1.5}
        />
      </Canvas>
    </div>
  );
}
