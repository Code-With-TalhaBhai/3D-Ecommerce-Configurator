"use client";

/**
 * Depth-only tapered cylinder standing in for the customer's real forearm.
 * The camera feed behind our transparent canvas already shows the real arm;
 * this mesh writes depth (but not color) so any part of the watch strap
 * geometry that would sit "behind" the real arm gets depth-tested away,
 * revealing the camera passthrough instead of rendered geometry poking
 * through the arm. Meant to be a child of the wrist anchor's <group> (same
 * quaternion as the watch), extending along local -Y — the anchor's basis
 * puts "along" (wrist → knuckles) on local +Y, so the forearm runs the
 * other way, back toward the elbow.
 */
export function ForearmOccluder({
  radiusNearWrist = 0.02,
  radiusNearElbow = 0.04,
  length = 0.18,
}: {
  radiusNearWrist?: number;
  radiusNearElbow?: number;
  length?: number;
}) {
  return (
    <mesh position={[0, -length / 2, 0]} renderOrder={-1}>
      <cylinderGeometry args={[radiusNearWrist, radiusNearElbow, length, 16]} />
      <meshBasicMaterial colorWrite={false} depthWrite={true} />
    </mesh>
  );
}
