import { describe, it, expect } from "vitest";
import { loadEnv } from "../src/env.js";

const VALID_BASE = {
  DATABASE_URL: "postgres://lnf:test@localhost:5432/lnf_test",
  BETTER_AUTH_URL: "http://localhost:3000",
};

describe("loadEnv", () => {
  it("accepts placeholder secrets in development", () => {
    const env = loadEnv({
      ...VALID_BASE,
      NODE_ENV: "development",
      BETTER_AUTH_SECRET: "replace-with-32-byte-base64-secret",
      PARTNER_API_KEY_PEPPER: "replace-with-random-32-byte-base64",
    } as NodeJS.ProcessEnv);
    expect(env.WEB_ORIGIN).toBe("http://localhost:3000");
  });

  it("refuses to start in production with placeholder BETTER_AUTH_SECRET", () => {
    expect(() =>
      loadEnv({
        ...VALID_BASE,
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: "replace-with-32-byte-base64-secret",
        PARTNER_API_KEY_PEPPER: "real-pepper-thats-long-enough-yes-yes",
      } as NodeJS.ProcessEnv),
    ).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("refuses to start in production with placeholder PARTNER_API_KEY_PEPPER", () => {
    expect(() =>
      loadEnv({
        ...VALID_BASE,
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: "real-secret-thats-long-enough-yes-yes",
        PARTNER_API_KEY_PEPPER: "replace-with-random-32-byte-base64",
      } as NodeJS.ProcessEnv),
    ).toThrow(/PARTNER_API_KEY_PEPPER/);
  });

  it("falls back WEB_ORIGIN to BETTER_AUTH_URL when unset", () => {
    const env = loadEnv({
      ...VALID_BASE,
      NODE_ENV: "development",
      BETTER_AUTH_SECRET: "real-secret-thats-long-enough-yes-yes",
      PARTNER_API_KEY_PEPPER: "real-pepper-thats-long-enough-yes-yes",
    } as NodeJS.ProcessEnv);
    expect(env.WEB_ORIGIN).toBe("http://localhost:3000");
  });

  it("respects an explicit WEB_ORIGIN distinct from BETTER_AUTH_URL", () => {
    const env = loadEnv({
      ...VALID_BASE,
      NODE_ENV: "development",
      BETTER_AUTH_SECRET: "real-secret-thats-long-enough-yes-yes",
      PARTNER_API_KEY_PEPPER: "real-pepper-thats-long-enough-yes-yes",
      WEB_ORIGIN: "https://portal.example.com",
    } as NodeJS.ProcessEnv);
    expect(env.WEB_ORIGIN).toBe("https://portal.example.com");
  });
});
