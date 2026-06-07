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
};

export default config;
