"use client";

import { Canvas } from "@react-three/fiber";
import { Bounds, Center, Environment, OrbitControls, useGLTF } from "@react-three/drei";
import { Suspense, useEffect } from "react";

type GlbViewerProps = {
  src: string;
  /** When src is a blob URL we own, revoke it on unmount. */
  revokeOnUnmount?: boolean;
  className?: string;
};

function Model({ src }: { src: string }) {
  const gltf = useGLTF(src);
  return <primitive object={gltf.scene} />;
}

export function GlbViewer({ src, revokeOnUnmount, className }: GlbViewerProps) {
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
        shadows
        dpr={[1, 2]}
        camera={{ position: [2, 2, 3], fov: 45 }}
        gl={{ antialias: true }}
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
      </Canvas>
    </div>
  );
}
