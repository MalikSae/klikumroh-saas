import type { NextConfig } from "next";
import path from "node:path";

// The API the /api and /uploads rewrites point to. Rewrites are compiled at build time, so set
// BACKEND_INTERNAL_URL in the environment of `npm run build` when the API does not listen on 127.0.0.1:8080
// (production uses another port, see DEPLOY.md 0.0).
const BACKEND = (process.env.BACKEND_INTERNAL_URL || "http://127.0.0.1:8080").replace(/\/+$/, "");

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
        destination: `${BACKEND}/uploads/:path*`,
      },
      {
        source: "/api/:path*",
        destination: `${BACKEND}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

