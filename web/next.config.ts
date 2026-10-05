import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Production runs the minimal standalone server (aaPanel Node.js project: one entry file + port).
  // See DEPLOY.md: copy `public` and `.next/static` next to server.js, run it with HOSTNAME=127.0.0.1.
  output: "standalone",
  turbopack: {
    root: path.resolve(__dirname, ".."),
  },
  allowedDevOrigins: [
    "127.0.0.1",
    "travela.klikumroh.local",
    "travelb.klikumroh.local",
    "klikumroh.local"
  ],
  async rewrites() {
    return [
      {
        source: "/uploads/:path*",
        // 127.0.0.1, not localhost: the API binds IPv4 loopback only, and Node may resolve localhost to ::1.
        destination: "http://127.0.0.1:8080/uploads/:path*",
      },
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:8080/api/:path*",
      },
    ];
  },
};

export default nextConfig;

