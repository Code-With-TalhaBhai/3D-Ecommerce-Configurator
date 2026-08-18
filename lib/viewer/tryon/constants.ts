/**
 * Tunable constants for the camera-landmark virtual try-on pipeline (wrist +
 * foot). Each one maps to a specific visual symptom — adjust the constant,
 * not the surrounding math, when that symptom shows up on-device.
 *
 * | Constant                    | Fixes / controls                                                          |
 * |------------------------------|----------------------------------------------------------------------------|
 * | PALM_WIDTH_M                 | Watch floats too close/far from the camera (depth is wrong). This is the  |
 * |                               | reference real-world hand width (knuckle 5 ↔ knuckle 17) used to convert  |
 * |                               | apparent pixel width into metric depth — raise it if the watch renders    |
 * |                               | too small/far, lower it if it renders too large/close.                    |
 * | WATCH_BACK_OFFSET_M           | Watch sits on the palm instead of the wrist, or floats past the wrist —   |
 * |                               | distance the anchor is pushed back along the hand's -along axis.          |
 * | WATCH_CASE_DIAMETER_M         | Watch renders at the wrong real-world size on the wrist (fixed default,   |
 * |                               | no per-product override — see progress-update.md).                       |
 * | CAMERA_FOV_DEG                | Depth math and the transparent try-on <PerspectiveCamera> must agree on   |
 * |                               | this value or every distance estimate is wrong. Must match the actual     |
 * |                               | device camera's vertical FOV as closely as possible.                     |
 * | UK_SIZE_REFERENCE_CM / STEP   | Shoe renders at the wrong real-world length for the selected size.        |
 * | WRIST_MIN_CONFIDENCE          | Watch flickers on/off or jitters — raise to require a steadier hand lock. |
 * | FOOT_MIN_CONFIDENCE           | Shoe flickers on/off; PoseLandmarker is unreliable on feet-only framing — |
 * |                               | raise if false-positive "tracking" states show up, lower if legitimate   |
 * |                               | tracking keeps dropping to "lost".                                       |
 * | FOOT_STABLE_TRACKING_MS       | Shoe pops in immediately on a noisy first frame — how long confidence     |
 * |                               | must stay above threshold before status flips to "tracking".             |
 * | SMOOTHING_POSITION_LERP       | Model position jitters (raise) or feels laggy/rubbery (lower).            |
 * | SMOOTHING_ROTATION_SLERP      | Model rotation jitters (raise) or feels laggy/rubbery (lower).            |
 * | WRIST_COMFORTABLE_MIN/MAX_M   | "Move closer"/"move back" hint shows too eagerly (widen) or too rarely    |
 * |                               | (narrow) — the depth range the wrist-distance estimate is trusted within. |
 * | FOOT_COMFORTABLE_MIN/MAX_M    | Same, for the foot distance hint.                                          |
 * | MANUAL_SCALE_STEP             | How much each tap of the manual +/- scale button changes size by.         |
 */

/** Reference hand width in meters (MCP-5 ↔ MCP-17), used to estimate depth
 * from the apparent pixel distance between those two landmarks. */
export const PALM_WIDTH_M = 0.082;

/** How far back (meters, along -along) the watch anchor is pushed from the
 * wrist landmark so the case sits on the wrist rather than the palm. */
export const WATCH_BACK_OFFSET_M = 0.035;

/** Fixed default watch case diameter (meters) used to scale every watch GLB
 * to real-world size. No per-product override — see the "Watch scale
 * source" decision in progress-update.md. */
export const WATCH_CASE_DIAMETER_M = 0.04;

/** Vertical field of view (degrees) assumed for both the depth-estimation
 * math and the transparent try-on <PerspectiveCamera>. Must be identical in
 * both places — defined once here so they can't drift apart. This is an
 * approximation of a typical rear-facing phone camera's vertical FOV; it is
 * not read from the actual device camera (the Web platform doesn't expose
 * that reliably), so real-world scale/position will be approximate. */
export const CAMERA_FOV_DEG = 60;

/** UK shoe size ↔ heel-to-toe length reference used to scale the shoe GLB
 * from the customer's selected size. Anchor point: UK 9 ≈ 27 cm. */
export const UK_SIZE_REFERENCE_UK = 9;
export const UK_SIZE_REFERENCE_CM = 27;
export const UK_SIZE_STEP_CM = 0.847;

/** Minimum HandLandmarker detection confidence before a wrist frame is
 * trusted at all. */
export const WRIST_MIN_CONFIDENCE = 0.6;

/** Minimum PoseLandmarker per-landmark visibility score (ankle/heel/toe)
 * before a foot frame counts as a detection candidate. PoseLandmarker is
 * trained on full-body framing and degrades noticeably when only feet are
 * visible, so this threshold is deliberately conservative. */
export const FOOT_MIN_CONFIDENCE = 0.5;

/** How long (ms) foot confidence must stay continuously above
 * FOOT_MIN_CONFIDENCE before status flips from "searching" to "tracking". */
export const FOOT_STABLE_TRACKING_MS = 1000;

/** Per-frame lerp factor for anchor position smoothing (0..1, higher = less
 * smoothing / more responsive). */
export const SMOOTHING_POSITION_LERP = 0.4;

/** Per-frame slerp factor for anchor rotation smoothing (0..1, higher = less
 * smoothing / more responsive). */
export const SMOOTHING_ROTATION_SLERP = 0.4;

/** Comfortable working-distance range (meters) for the wrist-held-in-front-
 * of-camera pose. Outside this range the depth estimate is still computed
 * but the placement gets progressively less reliable (very close = motion
 * blur / out of focus; very far = the palm-width reference shrinks to only
 * a few pixels, amplifying pixel-quantization noise). Unverified guesses —
 * tune from on-device testing. */
export const WRIST_COMFORTABLE_MIN_M = 0.15;
export const WRIST_COMFORTABLE_MAX_M = 0.55;

/** Comfortable working-distance range (meters) for the "stand back, phone
 * at chest height" foot pose. Unverified guesses — tune from on-device
 * testing. */
export const FOOT_COMFORTABLE_MIN_M = 0.6;
export const FOOT_COMFORTABLE_MAX_M = 2.5;

/** Multiplicative step per tap of the manual scale +/- control — a
 * deliberate escape hatch for the auto-computed scale (WATCH_CASE_DIAMETER_M
 * ÷ the model's own measured footprint) being wrong for a specific GLB's
 * authoring quirks, since there's no way to guarantee every vendor-uploaded
 * asset measures cleanly. */
export const MANUAL_SCALE_STEP = 1.15;

/** Self-hosted MediaPipe asset paths (never a CDN — see progress-update.md
 * "Self-host the .task model files and the MediaPipe WASM bundle"). */
export const MEDIAPIPE_WASM_BASE_PATH = "/mediapipe/wasm";
export const HAND_LANDMARKER_MODEL_PATH = "/mediapipe/models/hand_landmarker.task";
export const POSE_LANDMARKER_MODEL_PATH = "/mediapipe/models/pose_landmarker.task";
