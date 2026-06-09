import { describe, it, expect, beforeAll } from "vitest";

describe("healthz", () => {
  let app: typeof import("../src/index.js")["app"];
  beforeAll(async () => {
    process.env.PARTNER_API_KEY_PEPPER = "test_pepper_at_least_32_chars_long_xx";
    process.env.BETTER_AUTH_SECRET = "test_secret_at_least_32_chars_long_xxx";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    app = (await import("../src/index.js")).app;
  });

  it("returns ok", async () => {
    const res = await app.request("/api/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
