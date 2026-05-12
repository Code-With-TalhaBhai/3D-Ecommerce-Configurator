"use client";

import { Canvas } from "@react-three/fiber";
import { Bounds, Center, Environment, useGLTF } from "@react-three/drei";
import { Suspense } from "react";

type GlbThumbProps = {
  src: string;
  className?: string;
};

function Model({ src }: { src: string }) {
  const gltf = useGLTF(src);
  return <primitive object={gltf.scene} />;
}

export function GlbThumb({ src, className }: GlbThumbProps) {
  return (
    <div className={className}>
      <Canvas
        shadows="basic"
        dpr={[1, 1.5]}
        camera={{ position: [2, 2, 3], fov: 45 }}
        gl={{ antialias: true, powerPreference: "low-power" }}
        frameloop="demand"
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        <Suspense fallback={null}>
          <Bounds fit clip observe margin={1.3}>
            <Center>
              <Model src={src} />
            </Center>
          </Bounds>
          <Environment preset="studio" />
        </Suspense>
      </Canvas>
    </div>
  );
}
