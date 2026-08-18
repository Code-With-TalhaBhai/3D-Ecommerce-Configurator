"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import { getHandLandmarker } from "@/lib/viewer/tryon/landmarker-loader";
import { estimateDepthM, focalLengthPx, toThreeDirection, unprojectLandmark } from "@/lib/viewer/tryon/camera-math";
import { CAMERA_FOV_DEG, PALM_WIDTH_M, WATCH_BACK_OFFSET_M, WRIST_MIN_CONFIDENCE } from "@/lib/viewer/tryon/constants";
import { type AnchorFrame, type AnchorStatus, idleAnchorFrame } from "@/components/viewer/tryon/anchor";

// HandLandmarker landmark indices.
const WRIST = 0;
const INDEX_MCP = 5;
const PINKY_MCP = 17;

/**
 * Tracks a single wrist from the rear camera feed and derives a placement
 * frame for the watch.
 *
 * Rotation frame (from the metric worldLandmarks — direction vectors only,
 * see toThreeDirection):
 *   along       = normalize(midpoint(indexMcp, pinkyMcp) − wrist)   — wrist → knuckles
 *   across      = normalize(pinkyMcp − indexMcp)                     — across the knuckles
 *   palmNormal  = normalize(along × across)
 *   across      re-orthogonalized = normalize(palmNormal × along)
 *   rotation    = basis (across, along, palmNormal) → quaternion
 *
 * Position: apparent-palm-width depth estimate (see camera-math.ts) applied
 * to the wrist landmark's image-space (x, y), then offset back along
 * `−along` by WATCH_BACK_OFFSET_M so the watch sits on the wrist rather than
 * the palm.
 *
 * Runs its own requestVideoFrameCallback loop rather than piggybacking on
 * R3F's render loop — detection (the expensive part) shouldn't be gated on
 * whether the 3D scene is currently rendering, and guarding on
 * video.currentTime skips re-running the model on a frame that hasn't
 * changed. The computed frame is written to a ref (read every render frame
 * by TryOnScene's useFrame) rather than React state, so a ~30-60Hz detection
 * loop doesn't force a React re-render on every tick; `status` is mirrored
 * into real state since it only transitions occasionally and drives UI text.
 */
export function useWristAnchor(videoRef: React.RefObject<HTMLVideoElement | null>, enabled: boolean) {
  const frameRef = useRef<AnchorFrame>(idleAnchorFrame());
  const [status, setStatus] = useState<AnchorStatus>("loading");
  const frameCounterRef = useRef(0);
  // Dev-only, on-screen (not just console) diagnostic text — see the
  // matching overlay in tryon-viewer.tsx. Lets a phone with no attached
  // debugger show exactly what the detector is seeing.
  const [debugText, setDebugText] = useState("");

  useEffect(() => {
    if (!enabled) {
      frameRef.current = idleAnchorFrame("loading");
      setStatus("loading");
      return;
    }

    let cancelled = false;
    let rafHandle: number | null = null;
    let vfcHandle: number | null = null;
    let lastVideoTime = -1;

    // Stay in "loading" (not "searching") until the landmarker — WASM +
    // ~6-8MB model file, fetched on first use — has actually finished
    // loading. Setting "searching" here immediately would make a slow or
    // still-downloading model indistinguishable from "loaded but no hand
    // detected yet", which is exactly the confusing state this hook used to
    // put the UI in.
    setStatus("loading");

    getHandLandmarker()
      .then((landmarker) => {
        if (cancelled) return;
        setStatus("searching");

        const setTrackedStatus = (next: AnchorStatus) => {
          if (frameRef.current.status !== next) setStatus(next);
        };

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
            // A thrown detectForVideo is otherwise silent: it happens inside
            // a requestVideoFrameCallback callback, so an uncaught exception
            // here would just kill the loop mid-flight and freeze the UI on
            // whatever hint text was showing (indistinguishable from "no
            // hand found yet" — exactly the bug this surfaces instead of
            // hiding). Surface it as a real error state and stop retrying,
            // since a WASM/graph fault tends to repeat every frame.
            console.error("[try-on] wrist detectForVideo threw", err);
            frameRef.current = idleAnchorFrame("error");
            setStatus("error");
            return;
          }

          const landmarks = result.landmarks[0];
          const world = result.worldLandmarks[0];

          // Unconditional (not NODE_ENV-gated) while this feature is still
          // being verified on-device — a mid-debugging session is exactly
          // the wrong time to discover the diagnostics were silently
          // compiled out because the test happened to run against a
          // production build. Cheap enough (throttled, one string build
          // every ~20 ticks) to leave on regardless.
          frameCounterRef.current += 1;
          const showThisTick = frameCounterRef.current % 20 === 1;
          if (showThisTick) {
            const text = `#${frameCounterRef.current} hands=${result.landmarks.length} video=${video.videoWidth}x${video.videoHeight} rs=${video.readyState}`;
            console.debug(`[try-on] wrist ${text}`);
            setDebugText(text);
          }

          if (!landmarks || !world) {
            frameRef.current = { ...frameRef.current, confidence: 0, status: "searching" };
            setTrackedStatus("searching");
            scheduleNext();
            return;
          }

          const confidence = Math.min(
            landmarks[WRIST]?.visibility ?? 1,
            landmarks[INDEX_MCP]?.visibility ?? 1,
            landmarks[PINKY_MCP]?.visibility ?? 1,
          );

          if (showThisTick) {
            setDebugText((t) => `${t} conf=${confidence.toFixed(2)} (min ${WRIST_MIN_CONFIDENCE})`);
          }

          if (confidence < WRIST_MIN_CONFIDENCE) {
            frameRef.current = { ...frameRef.current, confidence, status: "lost" };
            setTrackedStatus("lost");
            scheduleNext();
            return;
          }

          const wristWorld = toThreeDirection(world[WRIST]);
          const indexWorld = toThreeDirection(world[INDEX_MCP]);
          const pinkyWorld = toThreeDirection(world[PINKY_MCP]);

          const along = indexWorld.clone().add(pinkyWorld).multiplyScalar(0.5).sub(wristWorld).normalize();
          let across = pinkyWorld.clone().sub(indexWorld).normalize();
          const palmNormal = new THREE.Vector3().crossVectors(along, across).normalize();
          across = new THREE.Vector3().crossVectors(palmNormal, along).normalize();

          const basis = new THREE.Matrix4().makeBasis(across, along, palmNormal);
          const quaternion = new THREE.Quaternion().setFromRotationMatrix(basis);

          const p5 = landmarks[INDEX_MCP];
          const p17 = landmarks[PINKY_MCP];
          const pixelDx = (p5.x - p17.x) * video.videoWidth;
          const pixelDy = (p5.y - p17.y) * video.videoHeight;
          const apparentPx = Math.hypot(pixelDx, pixelDy);
          const focalPx = focalLengthPx(video.videoHeight, CAMERA_FOV_DEG);
          const depthM = estimateDepthM(PALM_WIDTH_M, apparentPx, focalPx);

          const wristLandmark = landmarks[WRIST];
          const aspect = video.videoWidth / video.videoHeight;
          const position = unprojectLandmark(wristLandmark.x, wristLandmark.y, depthM, CAMERA_FOV_DEG, aspect);
          position.addScaledVector(along, -WATCH_BACK_OFFSET_M);

          frameRef.current = { position, quaternion, scale: 1, confidence, status: "tracking" };
          setTrackedStatus("tracking");
          scheduleNext();
        };

        scheduleNext();
      })
      .catch((err) => {
        console.error("[try-on] failed to load HandLandmarker", err);
        if (!cancelled) {
          frameRef.current = idleAnchorFrame("error");
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
  }, [enabled, videoRef]);

  return { frameRef, status, debugText };
}
