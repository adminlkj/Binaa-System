import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  allowedDevOrigins: ['localhost', '127.0.0.1', '21.0.15.103', '.space-z.ai', 'c-6a30e9a7-14a687f1-2227b9417671'],
};

export default nextConfig;
