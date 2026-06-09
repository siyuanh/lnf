import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const config: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Force the standalone trace root to the monorepo root so the trace runs
  // identically locally and in Docker (without this, Next's auto-detect picks
  // /repo/apps/web in Docker and emits server.js at the standalone root,
  // which breaks the Dockerfile COPY paths).
  outputFileTracingRoot: join(__dirname, "../.."),
  // Same-origin proxy for /api/*. Lets web + api share one Cloud Run service
  // (sidecar pattern) and avoids the *.run.app Public Suffix List cookie issue.
  // Dev: api runs on localhost:3001. Prod: api sidecar listens on localhost:3001
  // inside the same Cloud Run service. API_PROXY_TARGET overrides for testing.
  async rewrites() {
    const target = process.env.API_PROXY_TARGET ?? "http://localhost:3001";
    return [{ source: "/api/:path*", destination: `${target}/api/:path*` }];
  },
};

export default config;
