import * as THREE from "three";

/**
 * Vertical focal length in pixels for a pinhole-camera model, derived from
 * the video frame height and the assumed vertical FOV (CAMERA_FOV_DEG in
 * constants.ts). That constant must match the try-on overlay's
 * <PerspectiveCamera> exactly, or every depth estimate below is wrong.
 */
export function focalLengthPx(videoHeightPx: number, verticalFovDeg: number): number {
  const halfFovRad = ((verticalFovDeg * Math.PI) / 180) / 2;
  return videoHeightPx / 2 / Math.tan(halfFovRad);
}

/**
 * Estimates metric depth (meters, distance from the camera) from a known
 * real-world reference length and how many pixels it spans in the current
 * frame — the "apparent size" depth trick: the same real object shrinks in
 * pixels as it moves further from the camera, proportionally to
 * focalLength / distance.
 */
export function estimateDepthM(realReferenceM: number, apparentReferencePx: number, focalPx: number): number {
  if (apparentReferencePx <= 0) return Number.POSITIVE_INFINITY;
  return (realReferenceM * focalPx) / apparentReferencePx;
}

/**
 * Unprojects a MediaPipe normalized image-space landmark (x, y in 0..1,
 * y-down, origin top-left) to a world-space position at a given estimated
 * metric depth.
 *
 * Deliberately does NOT use THREE.Vector3.unproject(camera) — that expects
 * an NDC depth derived from the camera's near/far planes (non-linear), and
 * we already have a linear metric depth estimate from estimateDepthM, so
 * unproject() would need an extra, unnecessary NDC-depth conversion. This
 * does the pinhole projection directly instead.
 *
 * Assumes the overlay's <PerspectiveCamera> sits at the world origin with
 * the default orientation (looking down -Z, up +Y, no offset) — see
 * tryon-scene.tsx — so camera-space and world-space coincide and no
 * additional camera-transform step is needed.
 */
export function unprojectLandmark(
  normX: number,
  normY: number,
  depthM: number,
  verticalFovDeg: number,
  aspect: number,
): THREE.Vector3 {
  const ndcX = normX * 2 - 1;
  const ndcY = -(normY * 2 - 1);
  const halfFovRad = ((verticalFovDeg * Math.PI) / 180) / 2;
  const tanHalfFov = Math.tan(halfFovRad);
  return new THREE.Vector3(ndcX * depthM * tanHalfFov * aspect, ndcY * depthM * tanHalfFov, -depthM);
}

/**
 * Converts a MediaPipe world-landmark (metric, hand/pose-relative — x right,
 * y down, z away from the camera, matching MediaPipe's documented
 * image-space-aligned convention) into a three.js-convention vector (x
 * right, y up, z toward the viewer). Used only for direction vectors
 * (differences between landmarks) to build rotation bases — never for
 * absolute position, since worldLandmarks have no absolute camera distance.
 *
 * ASSUMPTION FLAGGED FOR ON-DEVICE VERIFICATION: this Y/Z flip is the
 * standard MediaPipe→three.js convention used across most community ports,
 * but hasn't been confirmed against this project's actual camera/render
 * setup on a physical device. If a placed watch/shoe renders visibly
 * upside-down or back-to-front, flip the sign here first.
 */
export function toThreeDirection(landmark: { x: number; y: number; z: number }): THREE.Vector3 {
  return new THREE.Vector3(landmark.x, -landmark.y, -landmark.z);
}
