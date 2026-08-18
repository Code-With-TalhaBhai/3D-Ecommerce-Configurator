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
export type ManualAdjustment = {
  scale: number;
  /** Rotation (radians) around each of the anchor's own local axes, applied
   * in X → Y → Z order on top of the auto-computed orientation. A single
   * Y-only rotate control can only ever reach 4 of the 24 possible
   * axis-aligned orientations an arbitrarily-authored GLB might actually
   * need (e.g. a model authored lying face-down needs an X or Z correction,
   * not Y) — three independent axes give real reach to fix any of them by
   * combining taps, rather than the customer being stuck cycling a Y-only
   * control that can never land on the right orientation. */
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  /** Extra push (meters) along the *tracked* local Y axis (before manual
   * rotation is applied) — i.e. further "along the forearm" for the wrist
   * anchor. Separate from WATCH_BACK_OFFSET_M's fixed value because the
   * anatomical `along` direction (see use-wrist-anchor.ts) depends on the
   * same worldLandmark coordinate-convention assumption flagged as
   * unverified — if that assumption is off, both the rotation *and* the
   * back-offset move together, so this needs to be independently
   * correctable too. */
  offsetAlongM: number;
};

export const IDENTITY_ADJUSTMENT: ManualAdjustment = {
  scale: 1,
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  offsetAlongM: 0,
};

function AnchoredModel({
  getFrame,
  modelScale,
  mirrorX = false,
  adjustment,
  children,
}: {
  getFrame: () => AnchorFrame;
  modelScale: number;
  mirrorX?: boolean;
  /** Manual escape hatch on top of the auto-computed transform — see
   * ManualAdjustment. Auto-measuring a real-world size and orientation from
   * an arbitrary vendor GLB (see useMeasuredFootprint and use-wrist-anchor's
   * doc comment) is a best-effort heuristic, not a guarantee; this is the
   * customer's way to correct it when it's visibly wrong for a given
   * product. */
  adjustment: ManualAdjustment;
  children: React.ReactNode;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const smoothed = useRef({
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    scale: new THREE.Vector3(1, 1, 1),
    finalPosition: new THREE.Vector3(),
    finalQuaternion: new THREE.Quaternion(),
    offsetVector: new THREE.Vector3(),
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

    // Position nudge applied in the *tracked* (pre manual-rotation) local
    // frame — "push further along the forearm" should stay tied to the
    // anatomical along-axis regardless of how the customer has manually
    // re-oriented the model to fix its appearance.
    smoothed.current.offsetVector.set(0, adjustment.offsetAlongM, 0).applyQuaternion(smoothed.current.quaternion);
    smoothed.current.finalPosition.copy(smoothed.current.position).add(smoothed.current.offsetVector);

    // Manual rotation is applied in the anchor's own local space (post-
    // multiply), i.e. "spin the object around its own axis, then place it"
    // — the standard three.js convention for rotating relative to an
    // object's current orientation rather than the world.
    smoothed.current.finalQuaternion
      .copy(smoothed.current.quaternion)
      .multiply(manualRotationQuaternion(adjustment.rotationX, adjustment.rotationY, adjustment.rotationZ));

    const finalScale = modelScale * adjustment.scale;
    smoothed.current.scale.set(mirrorX ? -finalScale : finalScale, finalScale, finalScale);
    group.matrix.compose(smoothed.current.finalPosition, smoothed.current.finalQuaternion, smoothed.current.scale);
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

const scratchEuler = new THREE.Euler();
const scratchRotationQuaternion = new THREE.Quaternion();
function manualRotationQuaternion(x: number, y: number, z: number) {
  scratchEuler.set(x, y, z, "XYZ");
  return scratchRotationQuaternion.setFromEuler(scratchEuler);
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
  adjustment,
  onStatusChange,
  onDebug,
  onDistance,
}: {
  src: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  adjustment: ManualAdjustment;
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
      <AnchoredModel getFrame={getFrame} modelScale={modelScale} adjustment={adjustment}>
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
  adjustment,
  onStatusChange,
  onDebug,
  onDistance,
}: {
  src: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  ukSize: number;
  adjustment: ManualAdjustment;
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
      <AnchoredModel getFrame={getLeftFrame} modelScale={modelScale} mirrorX adjustment={adjustment}>
        <primitive object={leftScene} />
      </AnchoredModel>
      <AnchoredModel getFrame={getRightFrame} modelScale={modelScale} adjustment={adjustment}>
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
  adjustment,
  onStatusChange,
  onDebug,
  onDistance,
}: {
  anchor: "wrist" | "foot";
  src: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  ukSize: number;
  adjustment: ManualAdjustment;
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
        adjustment={adjustment}
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
      adjustment={adjustment}
      onStatusChange={onStatusChange}
      onDebug={onDebug}
      onDistance={onDistance}
    />
  );
}
