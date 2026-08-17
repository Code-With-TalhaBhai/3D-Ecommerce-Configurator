import * as THREE from "three";

/**
 * Raw MediaPipe landmarks jitter noticeably frame-to-frame (hands especially).
 * These mutate `current` in place toward `target` by a fixed factor per call —
 * call once per rendered frame from useFrame, not per detection, so the
 * smoothing rate stays tied to render rate rather than the (slower, more
 * irregular) detection rate.
 */
export function smoothPositionTowards(current: THREE.Vector3, target: THREE.Vector3, lerpFactor: number) {
  current.lerp(target, lerpFactor);
}

export function smoothQuaternionTowards(current: THREE.Quaternion, target: THREE.Quaternion, slerpFactor: number) {
  current.slerp(target, slerpFactor);
}
