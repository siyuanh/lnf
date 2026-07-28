import { describe, it, expect, beforeAll } from "vitest";

describe("GET /api/public/config", () => {
  let app: typeof import("../src/index.js")["app"];
  beforeAll(async () => {
    process.env.PARTNER_API_KEY_PEPPER = "test_pepper_at_least_32_chars_long_xx";
    process.env.BETTER_AUTH_SECRET = "test_secret_at_least_32_chars_long_xxx";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
    app = (await import("../src/index.js")).app;
  });

  it("returns googleSignInEnabled based on env configuration", async () => {
    const res = await app.request("/api/public/config");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { googleSignInEnabled: boolean };
    expect(typeof body.googleSignInEnabled).toBe("boolean");
  });
});
