import * as THREE from "three";

export type AnchorStatus = "loading" | "searching" | "tracking" | "lost" | "error";

/**
 * The shape every try-on anchor hook (wrist, foot) returns — TryOnScene
 * binds whichever frame it's given to a <group> without ever knowing which
 * kind of anchor produced it.
 */
export type AnchorFrame = {
  position: THREE.Vector3 | null;
  quaternion: THREE.Quaternion | null;
  scale: number;
  confidence: number;
  status: AnchorStatus;
};

export function idleAnchorFrame(status: AnchorStatus = "loading"): AnchorFrame {
  return { position: null, quaternion: null, scale: 1, confidence: 0, status };
}
