import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { partner, partnerApiKey } from "../src/db/schema.js";
import { hashApiKey, makeApiKeyMiddleware, mintApiKey } from "../src/auth/api-key.js";
import { resetPartnerTables } from "./helpers/db.js";

describe("api-key middleware", () => {
  const db = drizzle(postgres(process.env.DATABASE_URL!));
  const pepper = "test_pepper_at_least_32_chars_long_xx";
  let partnerId: string;
  let presented: string;

  beforeEach(async () => {
    await resetPartnerTables(db);
    const [p] = await db.insert(partner).values({ name: "Acme", billingEmail: "ops@acme.test" }).returning();
    partnerId = p!.id;
    const minted = mintApiKey();
    presented = minted.presented;
    await db.insert(partnerApiKey).values({
      partnerId,
      keyPrefix: minted.prefix,
      keyHash: hashApiKey(minted.secret, pepper),
      label: "ci",
    });
  });

  function buildApp() {
    const app = new Hono();
    app.use("/x/*", makeApiKeyMiddleware({ db, pepper }));
    app.get("/x/me", (c) => c.json({ partnerId: c.get("partnerId") }));
    return app;
  }

  it("rejects missing header", async () => {
    const res = await buildApp().request("/x/me");
    expect(res.status).toBe(401);
  });

  it("rejects malformed token", async () => {
    const res = await buildApp().request("/x/me", { headers: { Authorization: "Bearer nope" } });
    expect(res.status).toBe(401);
  });

  it("rejects unknown prefix", async () => {
    const res = await buildApp().request("/x/me", {
      headers: { Authorization: "Bearer lnfp_AAAAAAAA_deadbeef" },
    });
    expect(res.status).toBe(401);
  });

  it("accepts a valid key and exposes partnerId", async () => {
    const res = await buildApp().request("/x/me", { headers: { Authorization: `Bearer ${presented}` } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ partnerId });
  });

  it("rejects a revoked key", async () => {
    await db.update(partnerApiKey).set({ revokedAt: new Date() });
    const res = await buildApp().request("/x/me", { headers: { Authorization: `Bearer ${presented}` } });
    expect(res.status).toBe(401);
  });
});
