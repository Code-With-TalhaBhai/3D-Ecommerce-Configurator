import { FilesetResolver, HandLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";

import {
  HAND_LANDMARKER_MODEL_PATH,
  MEDIAPIPE_WASM_BASE_PATH,
  POSE_LANDMARKER_MODEL_PATH,
} from "./constants";

/**
 * Lazy singleton loaders for the two MediaPipe landmarkers, mirroring the
 * cached-promise pattern lib/glb/process.ts already uses for the NodeIO /
 * Draco encoder singleton: the first caller triggers the (expensive) WASM +
 * model load, every subsequent call reuses the same in-flight or resolved
 * promise. Only ever called from client code that's already behind a
 * next/dynamic(ssr:false) boundary (see components/viewer/tryon/), so the
 * multi-MB WASM/model fetch never happens on the server or before the
 * customer actually opens try-on.
 *
 * The WASM bundle + model file together are ~13-20MB on first load (no
 * browser cache yet) — on a slow mobile connection this can take a while,
 * which is easy to mistake for "detection isn't working" if there's no
 * visible distinction between "still loading" and "loaded but not
 * detecting". The dev-mode timing logs below make that distinction explicit;
 * the anchor hooks (use-wrist-anchor.ts / use-foot-anchor.ts) keep `status`
 * at "loading" for this whole window rather than jumping to "searching"
 * early.
 */

function timedLoad<T>(label: string, promise: Promise<T>): Promise<T> {
  if (process.env.NODE_ENV !== "development") return promise;
  const startedAt = performance.now();
  console.info(`[try-on] ${label} loading…`);
  return promise
    .then((value) => {
      console.info(`[try-on] ${label} ready in ${(performance.now() - startedAt).toFixed(0)}ms`);
      return value;
    })
    .catch((err) => {
      console.error(`[try-on] ${label} failed after ${(performance.now() - startedAt).toFixed(0)}ms`, err);
      throw err;
    });
}

let filesetPromise: Promise<Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>> | null = null;

function loadFileset() {
  if (!filesetPromise) {
    filesetPromise = timedLoad("MediaPipe WASM fileset", FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_BASE_PATH));
  }
  return filesetPromise;
}

let handLandmarkerPromise: Promise<HandLandmarker> | null = null;

export function getHandLandmarker(): Promise<HandLandmarker> {
  if (!handLandmarkerPromise) {
    handLandmarkerPromise = timedLoad(
      "HandLandmarker",
      loadFileset().then((fileset) =>
        HandLandmarker.createFromOptions(fileset, {
          // CPU, not GPU: the try-on overlay already runs a transparent R3F
          // <Canvas> (its own WebGL context) on the same page. MediaPipe's
          // GPU delegate opens a second WebGL context for inference, and on
          // some mobile GPU drivers two concurrent WebGL contexts contend
          // for resources in ways that don't throw — they just produce
          // degenerate or empty detection results, which looks identical to
          // "no hand in frame" from the outside. CPU delegate is slower per
          // frame but has no such contention; revisit GPU once correctness
          // is confirmed on-device.
          baseOptions: { modelAssetPath: HAND_LANDMARKER_MODEL_PATH, delegate: "CPU" },
          runningMode: "VIDEO",
          numHands: 1,
        }),
      ),
    );
  }
  return handLandmarkerPromise;
}

let poseLandmarkerPromise: Promise<PoseLandmarker> | null = null;

export function getPoseLandmarker(): Promise<PoseLandmarker> {
  if (!poseLandmarkerPromise) {
    poseLandmarkerPromise = timedLoad(
      "PoseLandmarker",
      loadFileset().then((fileset) =>
        PoseLandmarker.createFromOptions(fileset, {
          // CPU delegate — same reasoning as HandLandmarker above.
          baseOptions: { modelAssetPath: POSE_LANDMARKER_MODEL_PATH, delegate: "CPU" },
          runningMode: "VIDEO",
          numPoses: 1,
        }),
      ),
    );
  }
  return poseLandmarkerPromise;
}
