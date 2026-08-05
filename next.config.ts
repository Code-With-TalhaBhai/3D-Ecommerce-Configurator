import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Anchor Turbopack to this project (avoids picking the parent workspace by mistake).
    root: path.resolve(__dirname),
  },
  // draco3dgltf loads its WASM via fs.readFileSync at runtime; bundling it
  // rewrites the path (to D:\ROOT\...) and breaks the encoder. Marking it
  // external keeps the require() pointing at node_modules so the .wasm
  // resolves correctly.
  allowedDevOrigins: ['192.168.10.10'],
  serverExternalPackages: ["draco3dgltf", "@gltf-transform/core"],
};

export default nextConfig;
