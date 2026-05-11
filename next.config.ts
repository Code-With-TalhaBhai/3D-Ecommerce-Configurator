import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Anchor Turbopack to this project (avoids picking the parent workspace by mistake).
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
