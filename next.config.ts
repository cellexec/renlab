import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // SDK spawns child processes — must not be bundled by webpack
  serverExternalPackages: ["claude-agent-sdk"],
};

export default nextConfig;
