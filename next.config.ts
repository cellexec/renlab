import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // SDK spawns child processes — must not be bundled by webpack/turbopack
  serverExternalPackages: ["node-claude-sdk"],
};

export default nextConfig;
