import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@a1plus/domain", "@a1plus/config", "@a1plus/ui"]
};

export default nextConfig;

