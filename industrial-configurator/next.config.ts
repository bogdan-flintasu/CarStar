import type { NextConfig } from "next";

const allowedDevOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  turbopack: { root: __dirname },
  devIndicators: false,
  allowedDevOrigins,
};

export default nextConfig;
