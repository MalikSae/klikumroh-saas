import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname, ".."),
  },
  allowedDevOrigins: [
    "travela.klikumroh.local",
    "travelb.klikumroh.local",
    "klikumroh.local"
  ],
  async rewrites() {
    return [
      {
        source: "/uploads/:path*",
        destination: "http://localhost:8080/uploads/:path*",
      },
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:8080/api/:path*",
      },
    ];
  },
};

export default nextConfig;

