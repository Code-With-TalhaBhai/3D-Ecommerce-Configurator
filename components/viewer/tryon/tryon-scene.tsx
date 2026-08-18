"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { useStyledScene } from "@/components/viewer/use-styled-scene";
import { useWristAnchor } from "./use-wrist-anchor";
import { useFootAnchor } from "./use-foot-anchor";
import { ForearmOccluder } from "./forearm-occluder";
import { GroundOccluder } from "./ground-occluder";
import { smoothPositionTowards, smoothQuaternionTowards } from "./smoothing";
import type { AnchorFrame, AnchorStatus } from "./anchor";
import {
  SMOOTHING_POSITION_LERP,
  SMOOTHING_ROTATION_SLERP,
  UK_SIZE_REFERENCE_CM,
  UK_SIZE_REFERENCE_UK,
  UK_SIZE_STEP_CM,
  WATCH_CASE_DIAMETER_M,
} from "@/lib/viewer/tryon/constants";

/**
 * Generic "bind an AnchorFrame to a smoothed group" renderer — the piece that
 * lets the actual product visuals stay ignorant of whether the transform
 * driving them came from the wrist anchor or the foot anchor (per the design
 * goal: the product component must not know which anchor is driving it).
 *
 * matrixAutoUpdate=false + a manual matrix.compose() each frame mirrors the
 * existing hit-test reticle pattern already used in ar-viewer.tsx.
 */
const LOCAL_Y_AXIS = new THREE.Vector3(0, 1, 0);

function AnchoredModel({
  getFrame,
  modelScale,
  mirrorX = false,
  extraScale = 1,
  extraRotationRad = 0,
  children,
}: {
  getFrame: () => AnchorFrame;
  modelScale: number;
  mirrorX?: boolean;
  /** Manual scale multiplier on top of the auto-computed modelScale — see
   * the "manual adjustment" controls in tryon-viewer.tsx. Auto-measuring a
   * real-world size from an arbitrary vendor GLB (see useMeasuredFootprint)
   * is a best-effort heuristic, not a guarantee; this is the user's escape
   * hatch when it's visibly wrong for a given product. */
  extraScale?: number;
  /** Manual rotation (radians) around the anchor's own local Y axis, on top
   * of the auto-computed wrist/foot-relative rotation. Same rationale as
   * extraScale: we don't know how any given vendor's GLB is authored
   * (which local axis is "forward", whether it's modeled lying flat for
   * product photography vs. already "wrist ready"), so the auto rotation
   * is a best guess the customer can correct. */
  extraRotationRad?: number;
  children: React.ReactNode;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const smoothed = useRef({
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    scale: new THREE.Vector3(1, 1, 1),
    finalQuaternion: new THREE.Quaternion(),
    initialized: false,
  });
  const visibleRef = useRef(false);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const frame = getFrame();
    const tracking = frame.status === "tracking" && frame.position != null && frame.quaternion != null;

    if (!tracking) {
      if (visibleRef.current) {
        group.visible = false;
        visibleRef.current = false;
      }
      // Don't drift toward a stale target while untracked — next tracked
      // frame re-snaps below via `initialized = false` reset on re-mount, or
      // simply resumes lerping from the last known good pose, which is
      // preferable to a visible jump for a momentary drop.
      return;
    }

    if (!smoothed.current.initialized) {
      smoothed.current.position.copy(frame.position!);
      smoothed.current.quaternion.copy(frame.quaternion!);
      smoothed.current.initialized = true;
    } else {
      smoothPositionTowards(smoothed.current.position, frame.position!, SMOOTHING_POSITION_LERP);
      smoothQuaternionTowards(smoothed.current.quaternion, frame.quaternion!, SMOOTHING_ROTATION_SLERP);
    }

    // Manual rotation is applied in the anchor's own local space (post-
    // multiply), i.e. "spin the object around its own axis, then place it"
    // — the standard three.js convention for rotating relative to an
    // object's current orientation rather than the world.
    smoothed.current.finalQuaternion
      .copy(smoothed.current.quaternion)
      .multiply(extraRotationQuaternion(extraRotationRad));

    const finalScale = modelScale * extraScale;
    smoothed.current.scale.set(mirrorX ? -finalScale : finalScale, finalScale, finalScale);
    group.matrix.compose(smoothed.current.position, smoothed.current.finalQuaternion, smoothed.current.scale);
    group.matrixWorldNeedsUpdate = true;

    if (!visibleRef.current) {
      group.visible = true;
      visibleRef.current = true;
    }
  });

  return (
    <group ref={groupRef} matrixAutoUpdate={false} visible={false}>
      {children}
    </group>
  );
}

const scratchRotationQuaternion = new THREE.Quaternion();
function extraRotationQuaternion(rad: number) {
  return scratchRotationQuaternion.setFromAxisAngle(LOCAL_Y_AXIS, rad);
}

/** Measures the styled clone's own footprint to derive a real-world-size
 * scale factor. Uses the SMALLER of the two horizontal extents, not the
 * larger: watch/shoe GLBs are typically authored lying flat with a strap or
 * lace extended, so the largest horizontal dimension is dominated by strap
 * length, not case/foot width — using it directly shrinks the whole model
 * far more than intended (confirmed via on-device testing: watches rendered
 * far too small). The narrower perpendicular extent is a much closer proxy
 * for "the actual object's own width", assuming (typical for wristwear) the
 * strap/lace is narrower than the case/foot itself. Still a heuristic, not
 * a guarantee — see the manual scale control in tryon-viewer.tsx for the
 * cases where it's wrong. Assumes a Y-up GLB authored lying flat/upright in
 * its natural resting orientation (same assumption Room-AR's floor-offset
 * logic already relies on). */
function useMeasuredFootprint(scene: THREE.Object3D) {
  return useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    return Math.min(size.x, size.z);
  }, [scene]);
}

function WristTryOnScene({
  src,
  videoRef,
  enabled,
  manualScale,
  manualRotationRad,
  onStatusChange,
  onDebug,
  onDistance,
}: {
  src: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  manualScale: number;
  manualRotationRad: number;
  onStatusChange?: (status: AnchorStatus) => void;
  onDebug?: (text: string) => void;
  onDistance?: (distanceM: number | null) => void;
}) {
  const { scene } = useStyledScene(src);
  const { frameRef, status, debugText, distanceM } = useWristAnchor(videoRef, enabled);
  const getFrame = useCallback(() => frameRef.current, [frameRef]);

  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  useEffect(() => {
    if (debugText) onDebug?.(debugText);
  }, [debugText, onDebug]);

  useEffect(() => {
    onDistance?.(distanceM);
  }, [distanceM, onDistance]);

  const measuredDiameter = useMeasuredFootprint(scene);
  const modelScale = measuredDiameter > 0 ? WATCH_CASE_DIAMETER_M / measuredDiameter : 1;

  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight position={[2, 4, 2]} intensity={0.7} />
      <AnchoredModel
        getFrame={getFrame}
        modelScale={modelScale}
        extraScale={manualScale}
        extraRotationRad={manualRotationRad}
      >
        <ForearmOccluder />
        <primitive object={scene} />
      </AnchoredModel>
    </>
  );
}

function realFootLengthM(ukSize: number) {
  const cm = UK_SIZE_REFERENCE_CM + (ukSize - UK_SIZE_REFERENCE_UK) * UK_SIZE_STEP_CM;
  return cm / 100;
}

function FootTryOnScene({
  src,
  videoRef,
  enabled,
  ukSize,
  manualScale,
  manualRotationRad,
  onStatusChange,
  onDebug,
  onDistance,
}: {
  src: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  ukSize: number;
  manualScale: number;
  manualRotationRad: number;
  onStatusChange?: (status: AnchorStatus) => void;
  onDebug?: (text: string) => void;
  onDistance?: (distanceM: number | null) => void;
}) {
  const { scene } = useStyledScene(src);
  const footLengthM = realFootLengthM(ukSize);
  const { framesRef, status, debugText, distanceM } = useFootAnchor(videoRef, enabled, footLengthM);

  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  useEffect(() => {
    if (debugText) onDebug?.(debugText);
  }, [debugText, onDebug]);

  useEffect(() => {
    onDistance?.(distanceM);
  }, [distanceM, onDistance]);

  // Two independent styled instances — one per foot slot — since the same
  // Object3D can't be placed at two transforms simultaneously. clone(true)
  // copies the node hierarchy/transforms but reuses (doesn't clone) the
  // already-styled materials, so both feet always match the current
  // color/finish pick.
  const leftScene = useMemo(() => scene.clone(true), [scene]);
  const rightScene = useMemo(() => scene.clone(true), [scene]);

  const measuredLength = useMeasuredFootprint(scene);
  const modelScale = measuredLength > 0 ? footLengthM / measuredLength : 1;

  const getLeftFrame = useCallback(() => framesRef.current[0], [framesRef]);
  const getRightFrame = useCallback(() => framesRef.current[1], [framesRef]);

  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight position={[2, 4, 2]} intensity={0.7} />

      <GroundOccluder getFrame={getLeftFrame} />
      <GroundOccluder getFrame={getRightFrame} />

      {/* Left foot mirrors the model — see AnchoredModel's mirrorX; if a
          mirrored shoe renders visually inside-out (culled front faces),
          the fix is setting material.side = THREE.DoubleSide on the left
          clone's materials, not a change here. */}
      <AnchoredModel
        getFrame={getLeftFrame}
        modelScale={modelScale}
        mirrorX
        extraScale={manualScale}
        extraRotationRad={manualRotationRad}
      >
        <primitive object={leftScene} />
      </AnchoredModel>
      <AnchoredModel
        getFrame={getRightFrame}
        modelScale={modelScale}
        extraScale={manualScale}
        extraRotationRad={manualRotationRad}
      >
        <primitive object={rightScene} />
      </AnchoredModel>
    </>
  );
}

export function TryOnScene({
  anchor,
  src,
  videoRef,
  enabled,
  ukSize,
  manualScale,
  manualRotationRad,
  onStatusChange,
  onDebug,
  onDistance,
}: {
  anchor: "wrist" | "foot";
  src: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  ukSize: number;
  manualScale: number;
  manualRotationRad: number;
  onStatusChange?: (status: AnchorStatus) => void;
  onDebug?: (text: string) => void;
  onDistance?: (distanceM: number | null) => void;
}) {
  if (anchor === "wrist") {
    return (
      <WristTryOnScene
        src={src}
        videoRef={videoRef}
        enabled={enabled}
        manualScale={manualScale}
        manualRotationRad={manualRotationRad}
        onStatusChange={onStatusChange}
        onDebug={onDebug}
        onDistance={onDistance}
      />
    );
  }
  return (
    <FootTryOnScene
      src={src}
      videoRef={videoRef}
      enabled={enabled}
      ukSize={ukSize}
      manualScale={manualScale}
      manualRotationRad={manualRotationRad}
      onStatusChange={onStatusChange}
      onDebug={onDebug}
      onDistance={onDistance}
    />
  );
}
