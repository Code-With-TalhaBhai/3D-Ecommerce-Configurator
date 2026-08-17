"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import { getPoseLandmarker } from "@/lib/viewer/tryon/landmarker-loader";
import { estimateDepthM, focalLengthPx, toThreeDirection, unprojectLandmark } from "@/lib/viewer/tryon/camera-math";
import { CAMERA_FOV_DEG, FOOT_MIN_CONFIDENCE, FOOT_STABLE_TRACKING_MS } from "@/lib/viewer/tryon/constants";
import { type AnchorFrame, type AnchorStatus, idleAnchorFrame } from "@/components/viewer/tryon/anchor";

// PoseLandmarker landmark indices.
const LEFT_ANKLE = 27;
const RIGHT_ANKLE = 28;
const LEFT_HEEL = 29;
const RIGHT_HEEL = 30;
const LEFT_TOE = 31;
const RIGHT_TOE = 32;

export type FootSide = "left" | "right";
export type FootAnchorFrame = AnchorFrame & { side: FootSide };

const SIDES: { side: FootSide; ankle: number; heel: number; toe: number }[] = [
  { side: "left", ankle: LEFT_ANKLE, heel: LEFT_HEEL, toe: LEFT_TOE },
  { side: "right", ankle: RIGHT_ANKLE, heel: RIGHT_HEEL, toe: RIGHT_TOE },
];

function idleFootFrame(side: FootSide, status: AnchorStatus = "loading"): FootAnchorFrame {
  return { ...idleAnchorFrame(status), side };
}

/**
 * Tracks both feet from the rear camera feed and derives a placement frame
 * per detected foot.
 *
 * Rotation frame per foot (from the metric worldLandmarks — direction
 * vectors only, see toThreeDirection):
 *   forward  = normalize(toe − heel)
 *   upRough  = normalize(ankle − heel)
 *   side     = normalize(upRough × forward)
 *   up       = normalize(forward × side)
 *   rotation = basis (side, up, forward) → quaternion
 *
 * Position: PoseLandmarker's worldLandmarks carry no absolute camera
 * distance, so — same technique as the wrist anchor (see camera-math.ts) —
 * depth is estimated from the apparent heel↔toe pixel span vs. the
 * customer's selected shoe size (real-world heel-to-toe length,
 * `realFootLengthM`, computed by the caller from UK_SIZE_REFERENCE_CM /
 * UK_SIZE_STEP_CM). This specific generalization from palm-width to
 * shoe-length isn't in the original spec (which only gives the depth
 * formula for wrist) and should be validated on a physical device.
 *
 * Confidence gating (required — PoseLandmarker is trained on full-body
 * framing and degrades noticeably when only feet are visible): a foot only
 * reaches "tracking" after its confidence has stayed continuously above
 * FOOT_MIN_CONFIDENCE for FOOT_STABLE_TRACKING_MS. Any frame that drops
 * below threshold immediately resets that foot to "lost" (never left to
 * drift) and restarts the stability timer.
 */
export function useFootAnchor(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  realFootLengthM: number,
) {
  const framesRef = useRef<FootAnchorFrame[]>([idleFootFrame("left"), idleFootFrame("right")]);
  const [status, setStatus] = useState<AnchorStatus>("loading");
  const frameCounterRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      framesRef.current = [idleFootFrame("left"), idleFootFrame("right")];
      setStatus("loading");
      return;
    }

    let cancelled = false;
    let rafHandle: number | null = null;
    let vfcHandle: number | null = null;
    let lastVideoTime = -1;
    const stableSinceMs: Record<FootSide, number | null> = { left: null, right: null };

    setStatus("searching");

    getPoseLandmarker()
      .then((landmarker) => {
        if (cancelled) return;

        const scheduleNext = () => {
          if (cancelled) return;
          const video = videoRef.current;
          if (video && typeof video.requestVideoFrameCallback === "function") {
            vfcHandle = video.requestVideoFrameCallback(detect);
          } else {
            rafHandle = requestAnimationFrame(detect);
          }
        };

        const detect = () => {
          if (cancelled) return;
          const video = videoRef.current;
          if (!video || video.readyState < 2 || video.currentTime === lastVideoTime) {
            scheduleNext();
            return;
          }
          lastVideoTime = video.currentTime;

          let result: ReturnType<typeof landmarker.detectForVideo>;
          try {
            result = landmarker.detectForVideo(video, performance.now());
          } catch (err) {
            // See the matching comment in use-wrist-anchor.ts — an uncaught
            // throw here would otherwise silently freeze the loop on
            // whatever status was last shown, indistinguishable from "no
            // foot found yet".
            console.error("[try-on] foot detectForVideo threw", err);
            framesRef.current = [idleFootFrame("left", "error"), idleFootFrame("right", "error")];
            setStatus("error");
            return;
          }

          const landmarks = result.landmarks[0];
          const world = result.worldLandmarks[0];
          const now = performance.now();

          if (process.env.NODE_ENV === "development") {
            frameCounterRef.current += 1;
            if (frameCounterRef.current % 60 === 1) {
              console.debug(
                `[try-on] foot detect tick #${frameCounterRef.current}: poses=${result.landmarks.length}`,
              );
            }
          }

          const nextFrames: FootAnchorFrame[] = SIDES.map(({ side, ankle, heel, toe }) => {
            if (!landmarks || !world) {
              stableSinceMs[side] = null;
              return idleFootFrame(side, "searching");
            }

            const confidence = Math.min(
              landmarks[ankle]?.visibility ?? 0,
              landmarks[heel]?.visibility ?? 0,
              landmarks[toe]?.visibility ?? 0,
            );

            if (confidence < FOOT_MIN_CONFIDENCE) {
              stableSinceMs[side] = null;
              return { ...idleFootFrame(side, "lost"), confidence };
            }

            if (stableSinceMs[side] == null) stableSinceMs[side] = now;
            const stableFor = now - (stableSinceMs[side] ?? now);
            if (stableFor < FOOT_STABLE_TRACKING_MS) {
              return { ...idleFootFrame(side, "searching"), confidence };
            }

            const heelWorld = toThreeDirection(world[heel]);
            const toeWorld = toThreeDirection(world[toe]);
            const ankleWorld = toThreeDirection(world[ankle]);

            const forward = toeWorld.clone().sub(heelWorld).normalize();
            const upRough = ankleWorld.clone().sub(heelWorld).normalize();
            const sideAxis = new THREE.Vector3().crossVectors(upRough, forward).normalize();
            const up = new THREE.Vector3().crossVectors(forward, sideAxis).normalize();

            const basis = new THREE.Matrix4().makeBasis(sideAxis, up, forward);
            const quaternion = new THREE.Quaternion().setFromRotationMatrix(basis);

            const heelPx = landmarks[heel];
            const toePx = landmarks[toe];
            const pixelDx = (toePx.x - heelPx.x) * video.videoWidth;
            const pixelDy = (toePx.y - heelPx.y) * video.videoHeight;
            const apparentPx = Math.hypot(pixelDx, pixelDy);
            const focalPx = focalLengthPx(video.videoHeight, CAMERA_FOV_DEG);
            const depthM = estimateDepthM(realFootLengthM, apparentPx, focalPx);

            const aspect = video.videoWidth / video.videoHeight;
            const position = unprojectLandmark(heelPx.x, heelPx.y, depthM, CAMERA_FOV_DEG, aspect);

            return { position, quaternion, scale: 1, confidence, status: "tracking" as const, side };
          });

          framesRef.current = nextFrames;
          const overall: AnchorStatus = nextFrames.some((f) => f.status === "tracking")
            ? "tracking"
            : nextFrames.some((f) => f.status === "searching")
              ? "searching"
              : nextFrames.some((f) => f.status === "lost")
                ? "lost"
                : "searching";
          setStatus((s) => (s === overall ? s : overall));
          scheduleNext();
        };

        scheduleNext();
      })
      .catch((err) => {
        console.error("[try-on] failed to load PoseLandmarker", err);
        if (!cancelled) {
          framesRef.current = [idleFootFrame("left", "error"), idleFootFrame("right", "error")];
          setStatus("error");
        }
      });

    return () => {
      cancelled = true;
      if (rafHandle != null) cancelAnimationFrame(rafHandle);
      if (vfcHandle != null && videoRef.current?.cancelVideoFrameCallback) {
        videoRef.current.cancelVideoFrameCallback(vfcHandle);
      }
    };
  }, [enabled, videoRef, realFootLengthM]);

  return { framesRef, status };
}
