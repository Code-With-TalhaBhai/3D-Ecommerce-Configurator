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
function AnchoredModel({
  getFrame,
  modelScale,
  mirrorX = false,
  children,
}: {
  getFrame: () => AnchorFrame;
  modelScale: number;
  mirrorX?: boolean;
  children: React.ReactNode;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const smoothed = useRef({
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    scale: new THREE.Vector3(1, 1, 1),
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

    smoothed.current.scale.set(mirrorX ? -modelScale : modelScale, modelScale, modelScale);
    group.matrix.compose(smoothed.current.position, smoothed.current.quaternion, smoothed.current.scale);
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

/** Measures the styled clone's own footprint (largest horizontal extent) to
 * derive a real-world-size scale factor. Assumes a Y-up GLB authored lying
 * flat/upright in its natural resting orientation (true for both the
 * existing Room-AR floor-offset logic and typical glTF exports) — an
 * approximation, not a guarantee, same caveat as Room AR's own "don't trust
 * the GLB's authored scale" note. */
function useMeasuredFootprint(scene: THREE.Object3D) {
  return useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    return Math.max(size.x, size.z);
  }, [scene]);
}

function WristTryOnScene({
  src,
  videoRef,
  enabled,
  onStatusChange,
}: {
  src: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  onStatusChange?: (status: AnchorStatus) => void;
}) {
  const { scene } = useStyledScene(src);
  const { frameRef, status } = useWristAnchor(videoRef, enabled);
  const getFrame = useCallback(() => frameRef.current, [frameRef]);

  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  const measuredDiameter = useMeasuredFootprint(scene);
  const modelScale = measuredDiameter > 0 ? WATCH_CASE_DIAMETER_M / measuredDiameter : 1;

  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight position={[2, 4, 2]} intensity={0.7} />
      <AnchoredModel getFrame={getFrame} modelScale={modelScale}>
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
  onStatusChange,
}: {
  src: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  ukSize: number;
  onStatusChange?: (status: AnchorStatus) => void;
}) {
  const { scene } = useStyledScene(src);
  const footLengthM = realFootLengthM(ukSize);
  const { framesRef, status } = useFootAnchor(videoRef, enabled, footLengthM);

  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

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
      <AnchoredModel getFrame={getLeftFrame} modelScale={modelScale} mirrorX>
        <primitive object={leftScene} />
      </AnchoredModel>
      <AnchoredModel getFrame={getRightFrame} modelScale={modelScale}>
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
  onStatusChange,
}: {
  anchor: "wrist" | "foot";
  src: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  ukSize: number;
  onStatusChange?: (status: AnchorStatus) => void;
}) {
  if (anchor === "wrist") {
    return <WristTryOnScene src={src} videoRef={videoRef} enabled={enabled} onStatusChange={onStatusChange} />;
  }
  return (
    <FootTryOnScene src={src} videoRef={videoRef} enabled={enabled} ukSize={ukSize} onStatusChange={onStatusChange} />
  );
}
