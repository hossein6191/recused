import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// This folder is the whole site. The repository around it has a lockfile of its own, and without
// these two settings Next.js takes that outer folder for the workspace root.
const here = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: { root: here },
  outputFileTracingRoot: here,
  // Turbopack's on-disk cache chokes on the macOS "._" sidecar files this drive writes into .next;
  // the cache is a speed-up only, so dev runs without it (builds keep their own cache and sweep first).
  experimental: {
    turbopackFileSystemCacheForDev: false,
  },
  async headers() {
    return [
      {
        // No page of this site may be shown inside another site's frame: a hidden frame over a
        // decoy could otherwise steer a connected visitor's clicks onto Countersign.
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          // /contracts/recused.py is served as text/plain so a browser shows it, and /deploy
          // fetches it; without this a browser is free to sniff that response into another type.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // A click through to the explorer must not carry the whole URL, only the origin.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // The contract source the /deploy page fetches; served as text so a browser shows it instead of downloading it.
        source: "/contracts/:path*",
        headers: [
          { key: "Content-Type", value: "text/plain; charset=utf-8" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
