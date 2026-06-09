import { describe, it, expect, beforeEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { partner, partnerApiKey, tag, tagBatch, auditEvent } from "../src/db/schema.js";
import { hashApiKey, mintApiKey } from "../src/auth/api-key.js";
import * as audit from "../src/audit/log.js";
import { resetPartnerTables } from "./helpers/db.js";

describe("mint atomicity", () => {
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

  it("rolls back batch + tags + audit if audit logging throws", async () => {
    const spy = vi.spyOn(audit, "logAuditEvent").mockImplementation(async () => {
      throw new Error("simulated failure");
    });
    const res = await app.request("/api/partner-api/batches", {
      method: "POST",
      body: JSON.stringify({ size: 10 }),
      headers: { "content-type": "application/json", authorization: `Bearer ${presented}` },
    });
    expect(res.status).toBeGreaterThanOrEqual(500);
    spy.mockRestore();
    expect(await db.select().from(tagBatch)).toHaveLength(0);
    expect(await db.select().from(tag)).toHaveLength(0);
    expect(await db.select().from(auditEvent)).toHaveLength(0);
  });
});
