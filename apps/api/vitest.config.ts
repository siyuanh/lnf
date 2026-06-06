import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    globalSetup: ["./tests/setup.ts"],
    // Tests share a single Postgres testcontainer; run files serially.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
