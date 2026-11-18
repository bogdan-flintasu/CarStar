import type { NextConfig } from "next";

const allowedDevOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  turbopack: { root: __dirname },
  devIndicators: false,
  allowedDevOrigins,
  // @react-pdf/renderer must run on the same React as the rest of the server code it is required from, not a bundled
  // copy, and loads its fonts from disk at run time.
  serverExternalPackages: ['@react-pdf/renderer'],
  // The PDF quote embeds these fonts (read with fs): ship them with the routes that build it.
  outputFileTracingIncludes: {
    '/api/configurations/[token]/pdf': ['./assets/fonts/**'],
    '/api/send-email': ['./assets/fonts/**'],
  },
};

export default nextConfig;
