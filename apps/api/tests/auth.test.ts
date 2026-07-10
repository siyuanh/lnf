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

  // Mobile clients authenticate with `Authorization: Bearer <token>` instead of
  // cookies. Verify the bearer plugin accepts the session token returned on
  // sign-in and lets a protected caregiver route through.
  it("authenticates a protected route via bearer token (mobile path)", async () => {
    const email = "bearer@acme.test";
    const signup = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({ email, password: "correct-horse-battery-staple", name: "B" }),
      headers: { "content-type": "application/json" },
    });
    expect([200, 201]).toContain(signup.status);
    // Better-Auth returns the session token in the set-auth-token header (bearer
    // plugin) and/or the JSON body `token`.
    const headerToken = signup.headers.get("set-auth-token");
    const body = (await signup.json()) as { token?: string };
    const token = headerToken ?? body.token;
    expect(token).toBeTruthy();

    const me = await app.request("/api/caregiver/me", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me.status).toBe(200);
    const meBody = (await me.json()) as { email: string };
    expect(meBody.email).toBe(email);
  });

  it("rejects a protected route with an invalid bearer token", async () => {
    const res = await app.request("/api/caregiver/me", {
      headers: { authorization: "Bearer not-a-real-token" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a protected route with no auth at all", async () => {
    const res = await app.request("/api/caregiver/me");
    expect(res.status).toBe(401);
  });
});
