"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { createXRStore, XR, IfInSessionMode, XRDomOverlay, useXR, useXRHitTest } from "@react-three/xr";
import * as THREE from "three";
import { Minus, Move, Plus, X } from "lucide-react";

import { useStyledScene } from "@/components/viewer/use-styled-scene";

// Handheld phone AR only — no controllers/hands (there aren't any), a
// continuous hit-test source for the reticle, and a DOM overlay so our
// placement UI renders on top of the camera passthrough. transientPointer /
// screenInput / gaze are @react-three/xr's own built-in "tap the screen to
// interact with the 3D scene" system — disabled because we handle every
// interaction ourselves via dedicated buttons and raw touch gestures on the
// dom-overlay; left enabled, it can claim touches before our own handlers
// ever see them.
const xrStore = createXRStore({
  hitTest: true,
  domOverlay: true,
  controller: false,
  hand: false,
  transientPointer: false,
  screenInput: false,
  gaze: false,
});

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
    // Accepting raw feature "point" hits alongside classified "plane" hits
    // lets the reticle lock on as soon as ARCore has any depth data for the
    // surface, rather than waiting for a full plane classification — which
    // on some devices/lighting can take noticeably longer or never resolve.
    ["plane", "point"],
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
  const placementRef = useRef(placement);
  const scaleRef = useRef(scale);
  useEffect(() => {
    placementRef.current = placement;
    scaleRef.current = scale;
  }, [placement, scale]);
  const camera = useThree((s) => s.camera);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);

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

  // One-finger drag repositions the placed model along the floor; two-finger
  // pinch-and-twist rescales it and spins it around its vertical axis in the
  // same gesture (matches the combined pinch/rotate interaction of most
  // mobile AR viewers). Both gestures are captured as raw touches on a
  // full-screen layer inside the WebXR dom-overlay (the standard way to get
  // real interactive HTML/touch handling on top of the AR camera feed) and
  // re-baseline every time the number of active fingers changes, so lifting
  // or adding a finger mid-gesture never causes a jump.
  const gestureRef = useRef<{
    mode: "none" | "drag" | "pinch";
    touches: { x: number; y: number }[];
    startPosition: THREE.Vector3;
    startQuaternion: THREE.Quaternion;
    startScale: number;
    startDistance: number;
    startAngle: number;
  }>({
    mode: "none",
    touches: [],
    startPosition: new THREE.Vector3(),
    startQuaternion: new THREE.Quaternion(),
    startScale: 1,
    startDistance: 0,
    startAngle: 0,
  });

  function readTouches(e: React.TouchEvent<HTMLDivElement>) {
    return Array.from(e.touches).map((t) => ({ x: t.clientX, y: t.clientY }));
  }

  function touchDistance(a: { x: number; y: number }, b: { x: number; y: number }) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function touchAngle(a: { x: number; y: number }, b: { x: number; y: number }) {
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  function beginGesture(touches: { x: number; y: number }[]) {
    const current = placementRef.current;
    if (!current || touches.length === 0) {
      gestureRef.current = { ...gestureRef.current, mode: "none", touches: [] };
      return;
    }
    const multi = touches.length >= 2;
    gestureRef.current = {
      mode: multi ? "pinch" : "drag",
      touches,
      startPosition: current.position.clone(),
      startQuaternion: current.quaternion.clone(),
      startScale: scaleRef.current,
      startDistance: multi ? touchDistance(touches[0], touches[1]) : 0,
      startAngle: multi ? touchAngle(touches[0], touches[1]) : 0,
    };
  }

  function handleGestureStart(e: React.TouchEvent<HTMLDivElement>) {
    const touches = readTouches(e);
    beginGesture(touches);
    if (process.env.NODE_ENV === "development") {
      setDebugInfo(`start fingers=${touches.length} mode=${gestureRef.current.mode}`);
    }
  }

  function handleGestureEnd(e: React.TouchEvent<HTMLDivElement>) {
    beginGesture(readTouches(e));
  }

  function handleGestureMove(e: React.TouchEvent<HTMLDivElement>) {
    const g = gestureRef.current;
    const current = placementRef.current;
    if (g.mode === "none" || !current) return;
    const touches = readTouches(e);
    if (touches.length !== g.touches.length) {
      // Finger count changed mid-gesture (e.g. one lifted during a pinch) —
      // re-baseline from here instead of computing a delta across the jump.
      beginGesture(touches);
      return;
    }

    if (g.mode === "pinch" && touches.length >= 2) {
      if (g.startDistance > 0) {
        const distance = touchDistance(touches[0], touches[1]);
        const factor = distance / g.startDistance;
        setScale(Math.min(3, Math.max(0.2, g.startScale * factor)));
      }

      // Twist maps 1:1 to a spin around the model's vertical (world Y) axis
      // — the standard "turn the furniture to face another way" gesture,
      // rather than rotating around the camera's view axis (which would tilt
      // the model instead of just turning it). Screen coordinates are
      // y-down, so the angle is negated to match the twist direction the
      // finger actually traces on screen.
      const angle = touchAngle(touches[0], touches[1]);
      const deltaAngle = angle - g.startAngle;
      const twist = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -deltaAngle);
      const nextQuaternion = twist.multiply(g.startQuaternion);
      setPlacement({ position: current.position, quaternion: nextQuaternion });
      if (process.env.NODE_ENV === "development") {
        setDebugInfo(`mode=pinch fingers=${touches.length} Δangle=${((deltaAngle * 180) / Math.PI).toFixed(1)}°`);
      }
    } else if (g.mode === "drag" && touches.length === 1) {
      const dx = touches[0].x - g.touches[0].x;
      const dy = touches[0].y - g.touches[0].y;

      // Drag is expressed relative to the phone's current facing direction
      // (camera right/forward projected onto the floor), not raw screen
      // axes, so it always tracks the model in the direction the customer
      // drags regardless of which way they're standing. Sensitivity is
      // normalized to screen width so it feels consistent across phones.
      const metersPerPixel = 2 / window.innerWidth;
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0;
      if (forward.lengthSq() > 1e-6) forward.normalize();
      const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();

      const nextPosition = g.startPosition
        .clone()
        .addScaledVector(right, dx * metersPerPixel)
        .addScaledVector(forward, -dy * metersPerPixel);
      setPlacement({ position: nextPosition, quaternion: current.quaternion });
      if (process.env.NODE_ENV === "development") {
        setDebugInfo(`mode=drag fingers=${touches.length}`);
      }
    }
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
        <div className="fixed inset-0">
          {/* Gesture layer: full-screen, sits beneath the button rows in
              paint order so buttons still get their own taps, but the rest
              of the screen is a real touch surface for drag/pinch on the
              placed model. touch-none stops the browser's own pinch-zoom /
              scroll gestures from fighting our handlers. */}
          {placement && (
            <div
              className="absolute inset-0 touch-none"
              onTouchStart={handleGestureStart}
              onTouchMove={handleGestureMove}
              onTouchEnd={handleGestureEnd}
              onTouchCancel={handleGestureEnd}
            />
          )}

          {process.env.NODE_ENV === "development" && debugInfo && (
            <div className="pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 rounded bg-black/70 px-2 py-1 font-mono text-[10px] text-white">
              {debugInfo}
            </div>
          )}

          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4">
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
                    {hasHit ? "Tap Place to set it down" : "Slowly move your phone to scan the floor or tabletop"}
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
                <>
                  <p className="rounded-full bg-black/55 px-3 py-1.5 text-center text-xs font-medium text-white backdrop-blur-md">
                    {process.env.NODE_ENV === "development" && debugInfo
                      ? debugInfo
                      : "Drag to move · pinch to resize · twist to rotate"}
                  </p>
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
                </>
              )}
            </div>
          </div>
        </div>
      </XRDomOverlay>
    </>
  );
}

export function ARViewer({ src, onClose }: { src: string; onClose: () => void }) {
  // "idle" — Canvas/<XR> is mounted but no session has been requested yet.
  // WebXR's requestSession() must run inside a direct user-gesture handler
  // AND after <XR> has attached Three's WebXRManager to the store (its very
  // first render does that) — calling it eagerly from a mount effect can
  // race both of those requirements. Requiring an explicit tap here
  // satisfies the gesture rule and guarantees the canvas has long since
  // mounted by the time it fires.
  const [status, setStatus] = useState<"idle" | "starting" | "active" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = xrStore.subscribe((state, prev) => {
      if (prev.session && !state.session) onClose();
    });
    return unsubscribe;
  }, [onClose]);

  function handleEnter() {
    setStatus("starting");
    setErrorMessage(null);
    xrStore.enterAR().catch((err: unknown) => {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : String(err));
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <Canvas gl={{ alpha: true, antialias: true }}>
        <XR store={xrStore}>
          <SessionWatcher
            onActiveChange={(active) => setStatus((s) => (active ? "active" : s === "active" ? "idle" : s))}
            onEnded={onClose}
          />
          <IfInSessionMode allow="immersive-ar">
            <ARScene src={src} />
          </IfInSessionMode>
        </XR>
      </Canvas>

      {status !== "active" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black px-6 text-center text-white">
          {status === "error" ? (
            <>
              <p className="text-sm font-medium">Couldn&apos;t start AR</p>
              {errorMessage && <p className="max-w-xs text-xs text-white/70">{errorMessage}</p>}
              <button
                type="button"
                onClick={handleEnter}
                className="rounded-full bg-white px-6 py-2.5 text-xs font-semibold text-zinc-900"
              >
                Try again
              </button>
            </>
          ) : status === "starting" ? (
            <p className="text-sm font-medium">Starting AR…</p>
          ) : (
            <>
              <p className="text-sm font-medium">Ready to view in AR</p>
              <button
                type="button"
                onClick={handleEnter}
                className="rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-zinc-900"
              >
                Enter AR
              </button>
            </>
          )}
          <button type="button" onClick={onClose} className="rounded-full border border-white/30 px-5 py-2 text-xs font-semibold">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
