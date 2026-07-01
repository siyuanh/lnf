import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { tag, tagBatch, partner, auditEvent } from "../src/db/schema.js";
import { resetPartnerTables } from "./helpers/db.js";

describe("tag activation (GET /api/tags/:code)", () => {
  process.env.PARTNER_API_KEY_PEPPER = "test_pepper_at_least_32_chars_long_xx";
  process.env.BETTER_AUTH_SECRET = "test_secret_at_least_32_chars_long_xxx";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";

  const client = postgres(process.env.DATABASE_URL!);
  const db = drizzle(client);
  let app: typeof import("../src/index.js")["app"];

  beforeAll(async () => {
    const mod = await import("../src/index.js");
    app = mod.app;
  });

  beforeEach(async () => {
    await resetPartnerTables(db);
  });

  it("transitions inactive→active on first GET and logs audit event", async () => {
    const [p] = await db.insert(partner).values({ name: "Acme", billingEmail: "ops@acme.test" }).returning();
    const [b] = await db.insert(tagBatch).values({ partnerId: p!.id, size: 1 }).returning();
    await db.insert(tag).values({ code: "SCAN1", partnerId: p!.id, batchId: b!.id, state: "inactive" });

    const res = await app.request("/api/public/tag/SCAN1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { state: string };
    expect(body.state).toBe("active");

    const rows = await db.select({ state: tag.state }).from(tag).where(eq(tag.code, "SCAN1"));
    expect(rows[0]!.state).toBe("active");

    const audits = await db.select().from(auditEvent).where(eq(auditEvent.kind, "tag.activated"));
    expect(audits).toHaveLength(1);
    expect(audits[0]!.partnerId).toBe(p!.id);
    const payload = audits[0]!.payload as { v: number; code: string };
    expect(payload.code).toBe("SCAN1");
  });

  it("returns active state on subsequent GET without re-logging", async () => {
    const [p] = await db.insert(partner).values({ name: "Acme2", billingEmail: "x@y.test" }).returning();
    const [b] = await db.insert(tagBatch).values({ partnerId: p!.id, size: 1 }).returning();
    await db.insert(tag).values({ code: "SCAN2", partnerId: p!.id, batchId: b!.id, state: "inactive" });

    await app.request("/api/public/tag/SCAN2");
    const res2 = await app.request("/api/public/tag/SCAN2");
    expect(res2.status).toBe(200);
    const body = (await res2.json()) as { state: string };
    expect(body.state).toBe("active");

    const audits = await db.select().from(auditEvent).where(eq(auditEvent.kind, "tag.activated"));
    expect(audits).toHaveLength(1);
  });

  it("returns 404 for unknown code", async () => {
    const res = await app.request("/api/public/tag/NOSUCH");
    expect(res.status).toBe(404);
  });

  it("returns current state for already-registered tag without transition", async () => {
    const [p] = await db.insert(partner).values({ name: "Acme3", billingEmail: "x@y.test" }).returning();
    const [b] = await db.insert(tagBatch).values({ partnerId: p!.id, size: 1 }).returning();
    await db.insert(tag).values({ code: "SCAN3", partnerId: p!.id, batchId: b!.id, state: "registered" });

    const res = await app.request("/api/public/tag/SCAN3");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { state: string };
    expect(body.state).toBe("registered");

    const audits = await db.select().from(auditEvent).where(eq(auditEvent.kind, "tag.activated"));
    expect(audits).toHaveLength(0);
  });
});
