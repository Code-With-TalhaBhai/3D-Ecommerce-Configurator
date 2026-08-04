"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { createXRStore, XR, IfInSessionMode, XRDomOverlay, useXR, useXRHitTest } from "@react-three/xr";
import * as THREE from "three";
import { Minus, Move, Plus, X } from "lucide-react";

import { useAppSelector } from "@/store/hooks";
import { FINISH_MAP, derivePartId, upgradeToPhysical } from "@/lib/viewer/material";

// Handheld phone AR only — no controllers/hands (there aren't any), a
// continuous hit-test source for the reticle, and a DOM overlay so our
// placement UI renders on top of the camera passthrough.
const xrStore = createXRStore({
  hitTest: true,
  domOverlay: true,
  controller: false,
  hand: false,
});

/**
 * Builds a customer-styled clone of the product's GLTF scene for AR.
 *
 * useGLTF caches the parsed scene by URL, and the main ConfigurableViewer
 * (still mounted behind this full-screen overlay) mutates that same shared
 * scene's mesh materials in place. Cloning here decouples the two — without
 * it, both viewers would fight over the same material instances. The clone
 * carries over whatever look (color / per-part color / finish / vendor
 * texture) the customer had selected in the configurator, since both read
 * from the same `viewer` Redux slice.
 */
function useStyledScene(src: string) {
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

  return { scene, floorOffset };
}

/** Continuous hit-test reticle. Tracks the real-world surface the camera is
 * pointed at (screen-center ray, matching phone-AR conventions) and reports
 * hit/no-hit transitions up so the "Place here" button can be disabled when
 * there's nothing valid to place on. */
function HitTestReticle({
  matrixRef,
  onHitChange,
  enabled,
}: {
  matrixRef: React.RefObject<THREE.Matrix4>;
  onHitChange: (hit: boolean) => void;
  enabled: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const lastHitRef = useRef(false);
  const geometry = useMemo(() => new THREE.RingGeometry(0.08, 0.1, 32).rotateX(-Math.PI / 2), []);

  useEffect(() => {
    if (!enabled && meshRef.current) meshRef.current.visible = false;
  }, [enabled]);

  useXRHitTest(
    enabled
      ? (results, getWorldMatrix) => {
          const hit = results.length > 0;
          if (hit) getWorldMatrix(matrixRef.current, results[0]);
          if (meshRef.current) {
            meshRef.current.visible = hit;
            if (hit) meshRef.current.matrix.copy(matrixRef.current);
          }
          if (hit !== lastHitRef.current) {
            lastHitRef.current = hit;
            onHitChange(hit);
          }
        }
      : undefined,
    "viewer",
    "plane",
  );

  return (
    <mesh ref={meshRef} geometry={geometry} matrixAutoUpdate={false} visible={false}>
      <meshBasicMaterial color="#3b82f6" transparent opacity={0.85} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** Reports the live WebXR session in/out of React state one level up, and
 * fires `onEnded` the moment a previously-active session ends — whether the
 * customer tapped our own exit button or backed out via the browser/OS AR
 * chrome. Must render inside `<XR>` to reach the store's context. */
function SessionWatcher({
  onActiveChange,
  onEnded,
}: {
  onActiveChange: (active: boolean) => void;
  onEnded: () => void;
}) {
  const session = useXR((s) => s.session);
  const hadSessionRef = useRef(false);

  useEffect(() => {
    const active = session != null;
    onActiveChange(active);
    if (!active && hadSessionRef.current) onEnded();
    hadSessionRef.current = active;
  }, [session, onActiveChange, onEnded]);

  return null;
}

function ARScene({ src }: { src: string }) {
  const { scene, floorOffset } = useStyledScene(src);
  const hitMatrixRef = useRef(new THREE.Matrix4());
  const [hasHit, setHasHit] = useState(false);
  const [placement, setPlacement] = useState<{ position: THREE.Vector3; quaternion: THREE.Quaternion } | null>(null);
  const [scale, setScale] = useState(1);

  function handlePlace() {
    if (!hasHit) return;
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const skip = new THREE.Vector3();
    hitMatrixRef.current.decompose(position, quaternion, skip);
    setPlacement({ position, quaternion });
  }

  function handleMove() {
    setPlacement(null);
  }

  function adjustScale(factor: number) {
    setScale((s) => Math.min(3, Math.max(0.2, s * factor)));
  }

  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight position={[2, 4, 2]} intensity={0.7} />

      <HitTestReticle matrixRef={hitMatrixRef} onHitChange={setHasHit} enabled={!placement} />

      {placement && (
        <group position={placement.position} quaternion={placement.quaternion} scale={scale}>
          <primitive object={scene} position={[0, floorOffset, 0]} />
        </group>
      )}

      <XRDomOverlay>
        <div className="pointer-events-none fixed inset-0 flex flex-col justify-between p-4">
          <div className="pointer-events-auto flex justify-end">
            <button
              type="button"
              onClick={() => xrStore.getState().session?.end()}
              aria-label="Exit AR"
              className="grid h-10 w-10 place-items-center rounded-full bg-black/55 text-white backdrop-blur-md active:bg-black/70"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="pointer-events-auto flex flex-col items-center gap-3 pb-4">
            {!placement ? (
              <>
                <p className="rounded-full bg-black/55 px-3 py-1.5 text-center text-xs font-medium text-white backdrop-blur-md">
                  {hasHit ? "Tap Place to set it down" : "Point your camera at a floor or tabletop"}
                </p>
                <button
                  type="button"
                  onClick={handlePlace}
                  disabled={!hasHit}
                  className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-zinc-900 shadow-lg shadow-black/20 disabled:opacity-40"
                >
                  Place here
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2 rounded-full bg-black/55 p-1.5 backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => adjustScale(0.9)}
                  aria-label="Smaller"
                  className="grid h-9 w-9 place-items-center rounded-full text-white active:bg-white/20"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleMove}
                  className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-semibold text-zinc-900"
                >
                  <Move className="h-3.5 w-3.5" /> Move
                </button>
                <button
                  type="button"
                  onClick={() => adjustScale(1.1)}
                  aria-label="Bigger"
                  className="grid h-9 w-9 place-items-center rounded-full text-white active:bg-white/20"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </XRDomOverlay>
    </>
  );
}

export function ARViewer({ src, onClose }: { src: string; onClose: () => void }) {
  const [status, setStatus] = useState<"starting" | "active" | "error">("starting");
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    xrStore.enterAR().catch(() => setStatus("error"));
  }, []);

  useEffect(() => {
    const unsubscribe = xrStore.subscribe((state, prev) => {
      if (prev.session && !state.session) onClose();
    });
    return unsubscribe;
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <Canvas gl={{ alpha: true, antialias: true }}>
        <XR store={xrStore}>
          <SessionWatcher onActiveChange={(active) => setStatus(active ? "active" : "starting")} onEnded={onClose} />
          <IfInSessionMode allow="immersive-ar">
            <ARScene src={src} />
          </IfInSessionMode>
        </XR>
      </Canvas>

      {status !== "active" && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black text-center text-white">
          {status === "error" ? (
            <>
              <p className="text-sm font-medium">Couldn&apos;t start AR</p>
              <p className="max-w-xs text-xs text-white/70">
                Your browser blocked camera access, or AR isn&apos;t available right now.
              </p>
            </>
          ) : (
            <p className="text-sm font-medium">Starting AR…</p>
          )}
          <button
            type="button"
            onClick={onClose}
            className="pointer-events-auto rounded-full border border-white/30 px-5 py-2 text-xs font-semibold"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
