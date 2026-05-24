"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { Bounds, Center, Environment, OrbitControls, useGLTF } from "@react-three/drei";
import { Suspense, useEffect } from "react";

type ScreenshotFn = (maxSize?: number) => string | null;

type GlbViewerProps = {
  src: string;
  /** When src is a blob URL we own, revoke it on unmount. */
  revokeOnUnmount?: boolean;
  className?: string;
  /**
   * Called once the WebGL renderer is mounted, with a function that captures
   * the current canvas frame as a PNG data URL. Used by the vendor upload
   * form to generate a 2D thumbnail from the live preview — see
   * app/(vendor)/vendor/products/new/new-product-form.tsx. The presence of
   * this prop also flips `preserveDrawingBuffer: true` on the renderer so
   * `toDataURL` returns the rendered frame instead of a blank canvas.
   */
  onScreenshotterReady?: (capture: ScreenshotFn) => void;
};

function Model({ src }: { src: string }) {
  const gltf = useGLTF(src);
  return <primitive object={gltf.scene} />;
}

function ScreenshotBridge({ onReady }: { onReady: (fn: ScreenshotFn) => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    const capture: ScreenshotFn = (maxSize = 512) => {
      try {
        // Force a fresh render — frameloop is "always" by default, but if the
        // canvas was just hidden/unmounted, this guarantees the buffer is
        // current before we read it.
        gl.render(scene, camera);
        const source = gl.domElement;
        if (source.width <= maxSize && source.height <= maxSize) {
          return source.toDataURL("image/png");
        }
        const ratio = Math.min(maxSize / source.width, maxSize / source.height);
        const target = document.createElement("canvas");
        target.width = Math.max(1, Math.round(source.width * ratio));
        target.height = Math.max(1, Math.round(source.height * ratio));
        const ctx = target.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(source, 0, 0, target.width, target.height);
        return target.toDataURL("image/png");
      } catch {
        return null;
      }
    };
    onReady(capture);
  }, [gl, scene, camera, onReady]);

  return null;
}

export function GlbViewer({
  src,
  revokeOnUnmount,
  className,
  onScreenshotterReady,
}: GlbViewerProps) {
  useEffect(() => {
    if (!revokeOnUnmount) return;
    return () => {
      try {
        URL.revokeObjectURL(src);
        useGLTF.clear(src);
      } catch {
        // ignore
      }
    };
  }, [src, revokeOnUnmount]);

  return (
    <div className={className}>
      <Canvas
        shadows="basic"
        dpr={[1, 2]}
        camera={{ position: [2, 2, 3], fov: 45 }}
        gl={{ antialias: true, preserveDrawingBuffer: !!onScreenshotterReady }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 5, 5]} intensity={1.1} castShadow />
        <Suspense fallback={null}>
          <Bounds fit clip observe margin={1.2}>
            <Center>
              <Model src={src} />
            </Center>
          </Bounds>
          <Environment preset="studio" />
        </Suspense>
        <OrbitControls makeDefault enableDamping />
        {onScreenshotterReady && <ScreenshotBridge onReady={onScreenshotterReady} />}
      </Canvas>
    </div>
  );
}
