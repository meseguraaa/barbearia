import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb", // ajuste se quiser: "2mb", "10mb", etc.
    },
  },
};

export default nextConfig;
