"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import type { AnchorFrame } from "./anchor";

/**
 * Depth-only horizontal plane at the tracked foot's approximate heel height,
 * so a shoe's sole doesn't visually sink through the real (camera-passthrough)
 * floor. Deliberately world-aligned rather than a child of the foot's rotated
 * anchor group — the ground stays flat regardless of how the foot is angled,
 * so only the Y translation (read from the same anchor frame each tick) is
 * applied, never the frame's rotation.
 */
export function GroundOccluder({ getFrame, size = 4 }: { getFrame: () => AnchorFrame; size?: number }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const frame = getFrame();
    const tracking = frame.status === "tracking" && frame.position != null;
    mesh.visible = tracking;
    if (tracking) mesh.position.y = frame.position!.y;
  });

  return (
    <mesh ref={meshRef} rotation-x={-Math.PI / 2} renderOrder={-1} visible={false}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial colorWrite={false} depthWrite={true} />
    </mesh>
  );
}
