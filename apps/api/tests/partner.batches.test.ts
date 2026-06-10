import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { partner, partnerApiKey, tag, auditEvent } from "../src/db/schema.js";
import { hashApiKey, mintApiKey } from "../src/auth/api-key.js";
import { resetPartnerTables } from "./helpers/db.js";

describe("POST /api/partner-api/batches", () => {
  const pepper = "test_pepper_at_least_32_chars_long_xx";
  process.env.PARTNER_API_KEY_PEPPER = pepper;
  process.env.BETTER_AUTH_SECRET = "test_secret_at_least_32_chars_long_xxx";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";

  const db = drizzle(postgres(process.env.DATABASE_URL!));
  let presented: string;
  let app: typeof import("../src/index.js")["app"];

  beforeEach(async () => {
    if (!app) {
      app = (await import("../src/index.js")).app;
    }
    await resetPartnerTables(db);
    const [p] = await db.insert(partner).values({ name: "Acme", billingEmail: "ops@acme.test" }).returning();
    const minted = mintApiKey();
    presented = minted.presented;
    await db.insert(partnerApiKey).values({
      partnerId: p!.id,
      keyPrefix: minted.prefix,
      keyHash: hashApiKey(minted.secret, pepper),
      label: "ci",
    });
  });

  it("rejects without auth", async () => {
    const res = await app.request("/api/partner-api/batches", {
      method: "POST",
      body: JSON.stringify({ size: 10 }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects size > 10000", async () => {
    const res = await app.request("/api/partner-api/batches", {
      method: "POST",
      body: JSON.stringify({ size: 10_001 }),
      headers: { "content-type": "application/json", authorization: `Bearer ${presented}` },
    });
    expect(res.status).toBe(400);
  });

  it("creates a batch and returns a download URL", async () => {
    const res = await app.request("/api/partner-api/batches", {
      method: "POST",
      body: JSON.stringify({ size: 25, label: "AW26" }),
      headers: { "content-type": "application/json", authorization: `Bearer ${presented}` },
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { batchId: string; size: number; downloadUrl: string; expiresAt: string };
    expect(body.size).toBe(25);
    expect(body.downloadUrl).toMatch(new RegExp(`/api/partner-api/batches/${body.batchId}/codes\\.csv\\?token=`));
    const tags = await db.select().from(tag).where(eq(tag.batchId, body.batchId));
    expect(tags).toHaveLength(25);
    expect(new Set(tags.map((t) => t.code)).size).toBe(25);
    const audits = await db.select().from(auditEvent).where(eq(auditEvent.kind, "partner.batch.minted"));
    expect(audits).toHaveLength(1);
  });
});
