import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1", "**.devtunnels.ms"],
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
