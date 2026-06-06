import { describe, it, expect, beforeAll } from "vitest";

describe("better-auth handler", () => {
  let app: typeof import("../src/index.js")["app"];
  beforeAll(async () => {
    process.env.PARTNER_API_KEY_PEPPER = "test_pepper_at_least_32_chars_long_xx";
    process.env.BETTER_AUTH_SECRET = "test_secret_at_least_32_chars_long_xxx";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    app = (await import("../src/index.js")).app;
  });

  it("responds to /api/auth/sign-up/email", async () => {
    const res = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({ email: "newp@acme.test", password: "correct-horse-battery-staple", name: "P" }),
      headers: { "content-type": "application/json" },
    });
    expect([200, 201]).toContain(res.status);
  });
});
