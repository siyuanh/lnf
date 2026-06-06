import { describe, it, expect } from "vitest";
import { startWorker } from "../src/worker/index.js";

describe("worker", () => {
  it("bootstraps and shuts down cleanly", async () => {
    const runner = await startWorker({ DATABASE_URL: process.env.DATABASE_URL! });
    expect(runner).toBeDefined();
    await runner.stop();
  });
});
