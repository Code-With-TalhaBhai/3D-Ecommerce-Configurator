"use client";

import { useEffect } from "react";
import confetti from "canvas-confetti";

// Fires a celebratory confetti burst once when the order-confirmation page
// mounts. Skipped for prefers-reduced-motion so it never fights an
// accessibility setting.
export function OrderConfetti() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const colors = ["#18181b", "#3f3f46", "#f4f4f5", "#a1a1aa"];
    const end = Date.now() + 900;

    (function frame() {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 60,
        origin: { x: 0, y: 0.7 },
        colors,
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 60,
        origin: { x: 1, y: 0.7 },
        colors,
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();

    confetti({
      particleCount: 80,
      spread: 100,
      startVelocity: 45,
      origin: { x: 0.5, y: 0.3 },
      colors,
    });
  }, []);

  return null;
}
