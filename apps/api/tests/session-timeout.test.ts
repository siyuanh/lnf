import { describe, it, expect, beforeAll } from "vitest";

describe("session timeout (sliding 15-min window)", () => {
  // Test with 3-second timeout instead of 15min to avoid long waits.
  process.env.PARTNER_API_KEY_PEPPER = "test_pepper_at_least_32_chars_long_xx";
  process.env.BETTER_AUTH_SECRET = "test_secret_at_least_32_chars_long_xxx";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.PARTNER_SESSION_MAX_AGE_SEC = "3";

  let app: typeof import("../src/index.js")["app"];

  beforeAll(async () => {
    app = (await import("../src/index.js")).app;
  });

  it("session remains valid within timeout window", async () => {
    // Sign up and capture the session cookie.
    const signupRes = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({ email: "timeout@example.com", password: "correct-horse", name: "Test" }),
      headers: { "content-type": "application/json" },
    });
    expect(signupRes.status).toBe(200);
    const cookie = signupRes.headers.get("set-cookie")!.split(";")[0]!;

    // Immediate authenticated request should succeed.
    const r1 = await app.request("/api/caregiver/me", { headers: { cookie } });
    expect(r1.status).toBe(200);

    // Wait 2 seconds (< 3-second timeout), session should still be valid.
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const r2 = await app.request("/api/caregiver/me", { headers: { cookie } });
    expect(r2.status).toBe(200);
  }, 10_000);

  it("expires session after timeout without requests", async () => {
    const signupRes = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({ email: "timeout2@example.com", password: "correct-horse", name: "Test2" }),
      headers: { "content-type": "application/json" },
    });
    expect(signupRes.status).toBe(200);
    const cookie = signupRes.headers.get("set-cookie")!.split(";")[0]!;

    // Immediate request succeeds.
    const r1 = await app.request("/api/caregiver/me", { headers: { cookie } });
    expect(r1.status).toBe(200);

    // Wait 4 seconds (> 3-second timeout) without any request in between.
    await new Promise((resolve) => setTimeout(resolve, 4000));

    // Session should be expired — Better-Auth returns 401 for expired sessions.
    const r2 = await app.request("/api/caregiver/me", { headers: { cookie } });
    expect(r2.status).toBe(401);
  }, 10_000);
});
