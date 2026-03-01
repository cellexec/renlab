import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // SDK spawns child processes — must not be bundled by webpack
  serverExternalPackages: ["node-claude-sdk"],
};

export default nextConfig;
