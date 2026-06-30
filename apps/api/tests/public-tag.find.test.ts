import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { auditEvent, find, partner, tag, tagBatch } from "../src/db/schema.js";
import { resetFindTables } from "./helpers/db.js";
import type { FindCreatedV1 } from "@app/schemas";

describe("POST /api/public/tag/:code/find", () => {
  process.env.PARTNER_API_KEY_PEPPER = "test_pepper_at_least_32_chars_long_xx";
  process.env.BETTER_AUTH_SECRET = "test_secret_at_least_32_chars_long_xxx";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";

  const db = drizzle(postgres(process.env.DATABASE_URL!));
  let app: typeof import("../src/index.js")["app"];

  beforeAll(async () => {
    app = (await import("../src/index.js")).app;
  });

  beforeEach(async () => {
    await resetFindTables(db);
  });

  it("returns 404 for unknown tag code", async () => {
    const res = await app.request("/api/public/tag/UNKNOWN/find", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        location: { kind: "gps", lat: 19.43, lon: -99.13 },
      }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("not_found");
  });

  it("returns 409 for inactive tag", async () => {
    const [p] = await db.insert(partner).values({ name: "Acme", billingEmail: "ops@acme.test" }).returning();
    const [b] = await db.insert(tagBatch).values({ partnerId: p!.id, size: 1 }).returning();
    await db.insert(tag).values({ code: "INACTIVE1", partnerId: p!.id, batchId: b!.id, state: "inactive" });

    const res = await app.request("/api/public/tag/INACTIVE1/find", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        location: { kind: "gps", lat: 19.43, lon: -99.13 },
      }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; state: string };
    expect(body.error).toBe("tag_not_active");
    expect(body.state).toBe("inactive");
  });

  it("returns 409 for active tag", async () => {
    const [p] = await db.insert(partner).values({ name: "Acme", billingEmail: "ops@acme.test" }).returning();
    const [b] = await db.insert(tagBatch).values({ partnerId: p!.id, size: 1 }).returning();
    await db.insert(tag).values({ code: "ACTIVE1", partnerId: p!.id, batchId: b!.id, state: "active" });

    const res = await app.request("/api/public/tag/ACTIVE1/find", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        location: { kind: "gps", lat: 19.43, lon: -99.13 },
      }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; state: string };
    expect(body.error).toBe("tag_not_active");
    expect(body.state).toBe("active");
  });

  it("returns 409 for deprecated tag", async () => {
    const [p] = await db.insert(partner).values({ name: "Acme", billingEmail: "ops@acme.test" }).returning();
    const [b] = await db.insert(tagBatch).values({ partnerId: p!.id, size: 1 }).returning();
    await db.insert(tag).values({ code: "DEPRECATED1", partnerId: p!.id, batchId: b!.id, state: "deprecated" });

    const res = await app.request("/api/public/tag/DEPRECATED1/find", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        location: { kind: "gps", lat: 19.43, lon: -99.13 },
      }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; state: string };
    expect(body.error).toBe("tag_not_active");
    expect(body.state).toBe("deprecated");
  });

  it("accepts GPS find on registered tag with message and contact", async () => {
    const [p] = await db.insert(partner).values({ name: "Acme", billingEmail: "ops@acme.test" }).returning();
    const [b] = await db.insert(tagBatch).values({ partnerId: p!.id, size: 1 }).returning();
    const [t] = await db.insert(tag).values({ code: "REG1", partnerId: p!.id, batchId: b!.id, state: "registered" }).returning();

    const res = await app.request("/api/public/tag/REG1/find", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        location: { kind: "gps", lat: 19.43, lon: -99.13, accuracyM: 12 },
        message: "on a bench",
        contact: "+52 55 1234 5678",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { findId: string };
    expect(body.findId).toMatch(/^[0-9a-f-]{36}$/);

    // Check find row
    const findRows = await db.select().from(find).where(eq(find.id, body.findId));
    expect(findRows).toHaveLength(1);
    const f = findRows[0]!;
    expect(f.tagId).toBe(t!.id);
    expect(f.locationKind).toBe("gps");
    expect(f.lat).toBe("19.43");
    expect(f.lon).toBe("-99.13");
    expect(f.accuracyM).toBe(12);
    expect(f.addressText).toBeNull();
    expect(f.finderMessage).toBe("on a bench");
    expect(f.finderContact).toBe("+52 55 1234 5678");

    // Check audit event
    const auditRows = await db.select().from(auditEvent).where(eq(auditEvent.kind, "find.created"));
    expect(auditRows).toHaveLength(1);
    const audit = auditRows[0]!;
    expect(audit.partnerId).toBe(p!.id);
    expect(audit.findId).toBe(body.findId);
    const payload = audit.payload as FindCreatedV1;
    expect(payload.v).toBe(1);
    expect(payload.findId).toBe(body.findId);
    expect(payload.tagCode).toBe("REG1");
    expect(payload.locationKind).toBe("gps");
  });

  it("accepts address-only find with no message or contact", async () => {
    const [p] = await db.insert(partner).values({ name: "Acme2", billingEmail: "ops2@acme.test" }).returning();
    const [b] = await db.insert(tagBatch).values({ partnerId: p!.id, size: 1 }).returning();
    const [t] = await db.insert(tag).values({ code: "REG2", partnerId: p!.id, batchId: b!.id, state: "registered" }).returning();

    const res = await app.request("/api/public/tag/REG2/find", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        location: { kind: "address", text: "bench by the fountain" },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { findId: string };
    expect(body.findId).toMatch(/^[0-9a-f-]{36}$/);

    // Check find row
    const findRows = await db.select().from(find).where(eq(find.id, body.findId));
    expect(findRows).toHaveLength(1);
    const f = findRows[0]!;
    expect(f.tagId).toBe(t!.id);
    expect(f.locationKind).toBe("address");
    expect(f.lat).toBeNull();
    expect(f.lon).toBeNull();
    expect(f.accuracyM).toBeNull();
    expect(f.addressText).toBe("bench by the fountain");
    expect(f.finderMessage).toBeNull();
    expect(f.finderContact).toBeNull();

    // Check audit event
    const auditRows = await db.select().from(auditEvent).where(eq(auditEvent.kind, "find.created"));
    expect(auditRows).toHaveLength(1);
    const audit = auditRows[0]!;
    expect(audit.partnerId).toBe(p!.id);
    expect(audit.findId).toBe(body.findId);
    const payload = audit.payload as FindCreatedV1;
    expect(payload.v).toBe(1);
    expect(payload.findId).toBe(body.findId);
    expect(payload.tagCode).toBe("REG2");
    expect(payload.locationKind).toBe("address");
  });

  it("rejects invalid latitude", async () => {
    const [p] = await db.insert(partner).values({ name: "Acme3", billingEmail: "ops3@acme.test" }).returning();
    const [b] = await db.insert(tagBatch).values({ partnerId: p!.id, size: 1 }).returning();
    await db.insert(tag).values({ code: "REG3", partnerId: p!.id, batchId: b!.id, state: "registered" });

    const res = await app.request("/api/public/tag/REG3/find", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        location: { kind: "gps", lat: 200, lon: 0 },
      }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects missing location", async () => {
    const [p] = await db.insert(partner).values({ name: "Acme4", billingEmail: "ops4@acme.test" }).returning();
    const [b] = await db.insert(tagBatch).values({ partnerId: p!.id, size: 1 }).returning();
    await db.insert(tag).values({ code: "REG4", partnerId: p!.id, batchId: b!.id, state: "registered" });

    const res = await app.request("/api/public/tag/REG4/find", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "no location",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("hashes x-forwarded-for into finderFingerprint when present", async () => {
    const [p] = await db.insert(partner).values({ name: "Acme5", billingEmail: "ops5@acme.test" }).returning();
    const [b] = await db.insert(tagBatch).values({ partnerId: p!.id, size: 1 }).returning();
    await db.insert(tag).values({ code: "REG5", partnerId: p!.id, batchId: b!.id, state: "registered" });

    const res = await app.request("/api/public/tag/REG5/find", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7" },
      body: JSON.stringify({
        location: { kind: "gps", lat: 19.43, lon: -99.13 },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { findId: string };

    const findRows = await db.select().from(find).where(eq(find.id, body.findId));
    expect(findRows).toHaveLength(1);
    const f = findRows[0]!;
    expect(f.finderFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it("stores null finderFingerprint when x-forwarded-for is absent", async () => {
    const [p] = await db.insert(partner).values({ name: "Acme6", billingEmail: "ops6@acme.test" }).returning();
    const [b] = await db.insert(tagBatch).values({ partnerId: p!.id, size: 1 }).returning();
    await db.insert(tag).values({ code: "REG6", partnerId: p!.id, batchId: b!.id, state: "registered" });

    const res = await app.request("/api/public/tag/REG6/find", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        location: { kind: "gps", lat: 19.43, lon: -99.13 },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { findId: string };

    const findRows = await db.select().from(find).where(eq(find.id, body.findId));
    expect(findRows).toHaveLength(1);
    const f = findRows[0]!;
    expect(f.finderFingerprint).toBeNull();
  });
});
