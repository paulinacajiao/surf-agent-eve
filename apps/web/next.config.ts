import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // DECISION: serve /public images as-is. With Vercel services (vercel.ts), the
  // Next.js image optimizer route /_next/image returned 404 on the deployment,
  // so every <Image> was broken. The bundled images are already web-sized.
  images: { unoptimized: true },
};

export default nextConfig;
