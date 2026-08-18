"use client";

import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Minus, Plus, RotateCw, X } from "lucide-react";

import { useCameraStream } from "./use-camera-stream";
import { TryOnScene } from "./tryon-scene";
import { SizePicker } from "./size-picker";
import type { AnchorStatus } from "./anchor";
import {
  CAMERA_FOV_DEG,
  FOOT_COMFORTABLE_MAX_M,
  FOOT_COMFORTABLE_MIN_M,
  MANUAL_SCALE_STEP,
  WRIST_COMFORTABLE_MAX_M,
  WRIST_COMFORTABLE_MIN_M,
} from "@/lib/viewer/tryon/constants";

/**
 * Fits the video's native (camera sensor) aspect ratio inside the viewport
 * without cropping (`object-contain`, letterboxed rather than `object-cover`
 * cropped-to-fill). This matters beyond cosmetics: the anchor hooks estimate
 * position from the video's *raw* pixel coordinates (0..1 normalized to
 * video.videoWidth/videoHeight), and the transparent <Canvas> camera's aspect
 * auto-tracks whatever container size it's given. If the video were cropped
 * to fill the viewport (object-cover) while the canvas stayed sized to the
 * full viewport, the two aspect ratios would disagree and every placed
 * model would sit visibly offset from where the landmark math intended.
 * Sizing both the <video> and the <Canvas> wrapper to this identical
 * letterboxed box keeps raw-video pixel space and canvas NDC space 1:1.
 */
function useLetterboxSize(videoRef: React.RefObject<HTMLVideoElement | null>, active: boolean) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!active) return;
    const video = videoRef.current;
    if (!video) return;

    function recompute() {
      const vw = video?.videoWidth;
      const vh = video?.videoHeight;
      if (!vw || !vh) return;
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      const videoAspect = vw / vh;
      const viewportAspect = viewportW / viewportH;
      if (videoAspect > viewportAspect) {
        setSize({ width: viewportW, height: viewportW / videoAspect });
      } else {
        setSize({ width: viewportH * videoAspect, height: viewportH });
      }
    }

    recompute();
    video.addEventListener("loadedmetadata", recompute);
    window.addEventListener("resize", recompute);
    return () => {
      video.removeEventListener("loadedmetadata", recompute);
      window.removeEventListener("resize", recompute);
    };
  }, [active, videoRef]);

  return size;
}

export function TryOnViewer({
  src,
  anchor,
  onClose,
  onFallbackToRoom,
}: {
  src: string;
  anchor: "wrist" | "foot";
  onClose: () => void;
  onFallbackToRoom?: () => void;
}) {
  const { videoRef, status: cameraStatus, error: cameraError, start, stop } = useCameraStream();
  const [trackingStatus, setTrackingStatus] = useState<AnchorStatus>("loading");
  const [ukSize, setUkSize] = useState(9);
  const [debugText, setDebugText] = useState("");
  const [distanceM, setDistanceM] = useState<number | null>(null);
  // Manual escape hatch for the auto-computed scale/rotation being wrong for
  // a specific vendor GLB — see AnchoredModel's extraScale/extraRotationRad
  // in tryon-scene.tsx for why this exists at all.
  const [manualScale, setManualScale] = useState(1);
  const [manualRotationRad, setManualRotationRad] = useState(0);

  const streaming = cameraStatus === "streaming";
  const box = useLetterboxSize(videoRef, streaming);

  function handleClose() {
    stop();
    onClose();
  }

  const hintText = (() => {
    if (!streaming) return null;
    switch (trackingStatus) {
      case "loading":
        return "Loading the tracker — first load can take a moment…";
      case "searching":
        return anchor === "wrist"
          ? "Hold your wrist out in front of the phone"
          : "Move back so your legs are visible";
      case "lost":
        return anchor === "wrist" ? "Lost your wrist — hold it steady in frame" : "Move back so your legs are visible";
      case "error":
        return "Tracking failed to start.";
      default:
        return null;
    }
  })();

  // Only meaningful while genuinely tracking — distanceM is cleared
  // whenever tracking drops, so this naturally hides itself alongside the
  // model rather than needing its own separate gating.
  const distanceHint = (() => {
    if (trackingStatus !== "tracking" || distanceM == null) return null;
    const [min, max] = anchor === "wrist" ? [WRIST_COMFORTABLE_MIN_M, WRIST_COMFORTABLE_MAX_M] : [FOOT_COMFORTABLE_MIN_M, FOOT_COMFORTABLE_MAX_M];
    if (distanceM < min) return "Too close — move back a little";
    if (distanceM > max) return "Too far — move a little closer";
    return null;
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black">
      {/* A single, permanently-mounted <video> element — never conditionally
          swapped for a different JSX node. start() attaches the camera
          stream to whatever videoRef.current is at the moment the user taps
          "Start Try-On", which is always this same DOM node; if this were
          two different <video> elements toggled by a condition (one hidden,
          one shown once the letterbox size is known), React would unmount
          the stream-attached node and mount a fresh, empty one the instant
          `box` became available — the visible video would then never have a
          srcObject, and the canvas overlay would have nothing to track
          against. Only the CSS (size/visibility) reacts to `box`. */}
      <video
        ref={videoRef}
        muted
        playsInline
        style={streaming && box ? { width: box.width, height: box.height } : { width: 0, height: 0 }}
        className={streaming && box ? "pointer-events-none absolute" : "hidden"}
      />

      {streaming && box && (
        <div className="absolute" style={{ width: box.width, height: box.height }}>
          <Canvas gl={{ alpha: true, antialias: true }} camera={{ fov: CAMERA_FOV_DEG, position: [0, 0, 0] }}>
            {/* Defense-in-depth: useStyledScene's useGLTF() suspends while
                the GLB is loading. In practice this product's GLB is always
                already cached by the on-page ConfigurableViewer by the time
                the try-on button can even be tapped (gated on modelReady),
                so this rarely if ever actually suspends — but without a
                boundary here, a genuine cache miss would throw an uncaught
                error instead of showing a brief loading state. */}
            <Suspense fallback={null}>
              <TryOnScene
                anchor={anchor}
                src={src}
                videoRef={videoRef}
                enabled={streaming}
                ukSize={ukSize}
                manualScale={manualScale}
                manualRotationRad={manualRotationRad}
                onStatusChange={setTrackingStatus}
                onDebug={setDebugText}
                onDistance={setDistanceM}
              />
            </Suspense>
          </Canvas>
        </div>
      )}

      {/* Unconditional while this feature is still being verified
          on-device — see the matching comment in use-wrist-anchor.ts on why
          this isn't NODE_ENV-gated right now. */}
      {debugText && (
        <div className="pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 rounded bg-black/70 px-2 py-1 font-mono text-[10px] text-white">
          {debugText}
        </div>
      )}

      {distanceHint && (
        <div className="pointer-events-none absolute left-1/2 top-28 -translate-x-1/2 rounded-full bg-amber-500/90 px-3 py-1.5 text-xs font-semibold text-amber-950 shadow-lg">
          {distanceHint}
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4">
        <div className="pointer-events-auto flex justify-end">
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close try-on"
            className="grid h-10 w-10 place-items-center rounded-full bg-black/55 text-white backdrop-blur-md active:bg-black/70"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="pointer-events-auto flex flex-col items-center gap-3 pb-4">
          {anchor === "foot" && streaming && <SizePicker value={ukSize} onChange={setUkSize} />}

          {trackingStatus === "tracking" && (
            <div className="flex items-center gap-2 rounded-full bg-black/55 p-1.5 backdrop-blur-md">
              <span className="pl-2 pr-1 text-[10px] font-medium uppercase tracking-wide text-white/60">
                Doesn&apos;t look right?
              </span>
              <button
                type="button"
                onClick={() => setManualScale((s) => s / MANUAL_SCALE_STEP)}
                aria-label="Smaller"
                className="grid h-8 w-8 place-items-center rounded-full text-white active:bg-white/20"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setManualScale((s) => s * MANUAL_SCALE_STEP)}
                aria-label="Bigger"
                className="grid h-8 w-8 place-items-center rounded-full text-white active:bg-white/20"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setManualRotationRad((r) => r + Math.PI / 2)}
                aria-label="Rotate 90 degrees"
                className="grid h-8 w-8 place-items-center rounded-full text-white active:bg-white/20"
              >
                <RotateCw className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {hintText && (
            <p className="rounded-full bg-black/55 px-3 py-1.5 text-center text-xs font-medium text-white backdrop-blur-md">
              {hintText}
            </p>
          )}
        </div>
      </div>

      {streaming && !box && (
        <div className="absolute inset-0 flex items-center justify-center bg-black text-white">
          <p className="text-sm font-medium">Preparing camera preview…</p>
        </div>
      )}

      {!streaming && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black px-6 text-center text-white">
          {cameraStatus === "denied" || cameraStatus === "error" ? (
            <>
              <p className="text-sm font-medium">Couldn&apos;t access the camera</p>
              {cameraError && <p className="max-w-xs text-xs text-white/70">{cameraError}</p>}
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={start}
                  className="rounded-full bg-white px-6 py-2.5 text-xs font-semibold text-zinc-900"
                >
                  Try again
                </button>
                {onFallbackToRoom && (
                  <button
                    type="button"
                    onClick={onFallbackToRoom}
                    className="rounded-full border border-white/30 px-5 py-2 text-xs font-semibold"
                  >
                    Use Room Placement instead
                  </button>
                )}
              </div>
            </>
          ) : cameraStatus === "requesting" ? (
            <p className="text-sm font-medium">Requesting camera access…</p>
          ) : (
            <>
              <p className="text-sm font-medium">
                {anchor === "wrist" ? "Try this watch on your wrist" : "Try these shoes on your feet"}
              </p>
              <p className="max-w-xs text-xs text-white/70">
                {anchor === "wrist"
                  ? "Hold your wrist out in front of your phone's rear camera."
                  : "Stand back with your phone at chest height so your legs are visible."}
              </p>
              <button
                type="button"
                onClick={start}
                className="rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-zinc-900"
              >
                Start Try-On
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/30 px-5 py-2 text-xs font-semibold"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
