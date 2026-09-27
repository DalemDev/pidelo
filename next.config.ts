import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Comprobantes de pago de hasta 5 MB (+ margen del multipart).
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
