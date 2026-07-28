import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import {
  auditEvent, caregiver, find, notificationAttempt, partner, tag, tagBatch, user,
} from "../src/db/schema.js";
import { resetCaregiverTables } from "./helpers/db.js";
import { signAckAttempt } from "../src/notify/ack-token.js";

process.env.PARTNER_API_KEY_PEPPER = "test_pepper_at_least_32_chars_long_xx";
process.env.BETTER_AUTH_SECRET = "test_secret_at_least_32_chars_long_xxx";
process.env.BETTER_AUTH_URL = "http://localhost:3000";

const db = drizzle(postgres(process.env.DATABASE_URL!));
const ACK_SECRET = process.env.BETTER_AUTH_SECRET!; // fallback per env.ts
let app: typeof import("../src/index.js")["app"];

beforeAll(async () => {
  app = (await import("../src/index.js")).app;
});

beforeEach(async () => {
  await resetCaregiverTables(db);
});

async function seedAttempt(over: { usedAt?: Date; expiresAt?: Date } = {}) {
  const [u] = await db.insert(user).values({ id: crypto.randomUUID(), email: "cg@test.dev" }).returning();
  const [cg] = await db.insert(caregiver).values({ userId: u!.id }).returning();
  const [p] = await db.insert(partner).values({ name: "Acme", billingEmail: "ops@acme.test" }).returning();
  const [b] = await db.insert(tagBatch).values({ partnerId: p!.id, size: 1 }).returning();
  const [t] = await db.insert(tag).values({ code: "ACK1", partnerId: p!.id, batchId: b!.id, state: "registered", caregiverId: cg!.id }).returning();
  const [f] = await db.insert(find).values({ tagId: t!.id, locationKind: "gps", lat: "19.43", lon: "-99.13" }).returning();
  const [a] = await db
    .insert(notificationAttempt)
    .values({
      findId: f!.id,
      channelKind: "email",
      channelTarget: "cg@test.dev",
      deliveryStatus: "sent",
      ackLinkExpiresAt: over.expiresAt ?? new Date(Date.now() + 24 * 3600 * 1000),
      ackLinkUsedAt: over.usedAt ?? null,
    })
    .returning();
  return { findId: f!.id, attemptId: a!.id, caregiverId: cg!.id };
}

describe("POST /api/public/ack/:attemptId (S1-4)", () => {
  it("acks the find with a valid token (first click)", async () => {
    const { findId, attemptId } = await seedAttempt();
    const token = signAckAttempt(attemptId, ACK_SECRET);
    const res = await app.request(`/api/public/ack/${attemptId}?token=${encodeURIComponent(token)}`, { method: "POST" });
    expect(res.status).toBe(200);

    const f = await db.select().from(find).where(eq(find.id, findId));
    expect(f[0]!.status).toBe("acknowledged");
    expect(f[0]!.acknowledgedAt).not.toBeNull();

    const a = await db.select().from(notificationAttempt).where(eq(notificationAttempt.id, attemptId));
    expect(a[0]!.ackLinkUsedAt).not.toBeNull();

    const audit = await db.select().from(auditEvent).where(eq(auditEvent.kind, "find.acknowledged"));
    expect(audit).toHaveLength(1);
  });

  it("second click returns 410 (single-use, §4.3 #23)", async () => {
    const { attemptId } = await seedAttempt();
    const token = signAckAttempt(attemptId, ACK_SECRET);
    const first = await app.request(`/api/public/ack/${attemptId}?token=${encodeURIComponent(token)}`, { method: "POST" });
    expect(first.status).toBe(200);
    const second = await app.request(`/api/public/ack/${attemptId}?token=${encodeURIComponent(token)}`, { method: "POST" });
    expect(second.status).toBe(410);
  });

  it("expired link returns 410 (§4.3 #23a)", async () => {
    const { attemptId } = await seedAttempt({ expiresAt: new Date(Date.now() - 1000) });
    const token = signAckAttempt(attemptId, ACK_SECRET);
    const res = await app.request(`/api/public/ack/${attemptId}?token=${encodeURIComponent(token)}`, { method: "POST" });
    expect(res.status).toBe(410);
  });

  it("bad token returns 401 and acks nothing", async () => {
    const { findId, attemptId } = await seedAttempt();
    const res = await app.request(`/api/public/ack/${attemptId}?token=bogus`, { method: "POST" });
    expect(res.status).toBe(401);
    const f = await db.select().from(find).where(eq(find.id, findId));
    expect(f[0]!.status).toBe("reported");
  });
});
