"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type CameraStreamStatus = "idle" | "requesting" | "streaming" | "denied" | "error";

/**
 * Owns the rear-camera getUserMedia stream lifecycle for try-on.
 *
 * `start()` must be called from a direct user-gesture handler (a click),
 * never from an effect on mount — iOS Safari (and most mobile browsers)
 * silently reject or never resolve getUserMedia otherwise. This mirrors the
 * same fix already applied to Room AR's xrStore.enterAR() (see the
 * 2026-08-13 session note on requiring an explicit "Enter AR" tap).
 */
export function useCameraStream() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStreamStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("idle");
  }, []);

  const start = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setError("Camera access isn't available in this browser.");
      return;
    }

    setStatus("requesting");
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStatus("streaming");
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      setStatus(name === "NotAllowedError" || name === "PermissionDeniedError" ? "denied" : "error");
      setError(err instanceof Error ? err.message : "Couldn't access the camera.");
    }
  }, []);

  // Cleanup on unmount only — not tied to `stop`'s identity, which is stable
  // via useCallback anyway, but this makes the "always stop tracks on
  // unmount" contract explicit regardless.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return { videoRef, status, error, start, stop };
}
