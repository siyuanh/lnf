import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { asc, eq } from "drizzle-orm";
import {
  auditEvent, caregiver, find, notificationAttempt, notificationChannel, partner, spendLedger, tag, tagBatch, user,
} from "../src/db/schema.js";
import { resetCaregiverTables } from "./helpers/db.js";
import { makeFakeSenders } from "../src/notify/senders.js";
import { makeHarness, jobPayloads } from "./helpers/escalation.js";
import { signAckAttempt } from "../src/notify/ack-token.js";
import type { Db } from "../src/db/client.js";

process.env.PARTNER_API_KEY_PEPPER = "test_pepper_at_least_32_chars_long_xx";
process.env.BETTER_AUTH_SECRET = "test_secret_at_least_32_chars_long_xxx";
process.env.BETTER_AUTH_URL = "http://localhost:3000";

const db = drizzle(postgres(process.env.DATABASE_URL!));
let app: typeof import("../src/index.js")["app"];

beforeAll(async () => {
  app = (await import("../src/index.js")).app;
});

beforeEach(async () => {
  await resetCaregiverTables(db);
  await db.execute(sql`delete from graphile_worker._private_jobs`);
});

// Caregiver with a registered tag and the full default chain email → sms → voice.
async function seedChain(code: string) {
  const [u] = await db.insert(user).values({ id: crypto.randomUUID(), email: "cg@test.dev" }).returning();
  const [cg] = await db.insert(caregiver).values({ userId: u!.id }).returning();
  const [p] = await db.insert(partner).values({ name: "Acme", billingEmail: "ops@acme.test" }).returning();
  const [b] = await db.insert(tagBatch).values({ partnerId: p!.id, size: 1 }).returning();
  await db.insert(tag).values({ code, partnerId: p!.id, batchId: b!.id, state: "registered", caregiverId: cg!.id });
  const channels = [
    { kind: "email" as const, target: "cg@test.dev", priority: 0, escalationDelaySeconds: 300 },
    { kind: "sms" as const, target: "+5215512345678", priority: 1, escalationDelaySeconds: 300 },
    { kind: "voice" as const, target: "+5215512345678", priority: 2, escalationDelaySeconds: 0 },
  ];
  for (const ch of channels) {
    await db.insert(notificationChannel).values({ caregiverId: cg!.id, ...ch });
  }
  return { caregiverId: cg!.id };
}

function harnessDeps(calls: ReturnType<typeof makeFakeSenders>["calls"]) {
  const fake = makeFakeSenders({ calls });
  return {
    db: db as unknown as Db,
    senders: fake.senders,
    ackSecret: process.env.BETTER_AUTH_SECRET!,
    publicBaseUrl: "https://api.test",
    spendCapDailyMinor: 500,
  };
}

describe("UC-3: caregiver acknowledges the alert", () => {
  it("finder report → email dispatched → email ack stops the chain before SMS", async () => {
    await seedChain("UC3A1");

    // Finder submits through the real HTTP surface; the job lands in the real queue.
    const res = await app.request("/api/public/tag/UC3A1/find", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ location: { kind: "address", text: "el parque" } }),
    });
    expect(res.status).toBe(200);
    const { findId } = (await res.json()) as { findId: string };
    expect(await jobPayloads(db)).toEqual([{ findId, step: 0 }]);

    // Drain step 0 with fake senders (harness records re-enqueues in memory).
    const calls: ReturnType<typeof makeFakeSenders>["calls"] = [];
    const h = makeHarness(harnessDeps(calls));
    await h.run(findId, 0);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.msg.kind).toBe("email");
    expect(calls.filter((c) => c.msg.kind === "sms")).toHaveLength(0);
    const sent = await db.select().from(notificationAttempt).where(eq(notificationAttempt.findId, findId));
    expect(sent).toHaveLength(1);
    expect(sent[0]!.deliveryStatus).toBe("sent");
    expect(h.scheduled).toEqual([{ payload: { findId, step: 1 }, runAt: expect.any(Date) }]);

    // The caregiver clicks the ack link from the email.
    const token = signAckAttempt(sent[0]!.id, process.env.BETTER_AUTH_SECRET!);
    const ack = await app.request(`/api/public/ack/${sent[0]!.id}?token=${encodeURIComponent(token)}`, { method: "POST" });
    expect(ack.status).toBe(200);
    const f = await db.select().from(find).where(eq(find.id, findId));
    expect(f[0]!.status).toBe("acknowledged");

    // Draining the already-scheduled next step is a no-op: chain stopped.
    await h.run(findId, 1);
    expect(calls).toHaveLength(1);
    const attemptsAfter = await db.select().from(notificationAttempt).where(eq(notificationAttempt.findId, findId));
    expect(attemptsAfter).toHaveLength(1);
  });
});

describe("UC-4: caregiver does not respond", () => {
  it("chain escalates email → sms → voice then expires", async () => {
    const { caregiverId } = await seedChain("UC4A1");

    const res = await app.request("/api/public/tag/UC4A1/find", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ location: { kind: "address", text: "el parque" } }),
    });
    expect(res.status).toBe(200);
    const { findId } = (await res.json()) as { findId: string };

    // Drain every step in order (harness ignores runAt — §5.1 mock clock).
    const calls: ReturnType<typeof makeFakeSenders>["calls"] = [];
    const h = makeHarness(harnessDeps(calls));
    await h.run(findId, 0);
    await h.run(findId, 1);
    await h.run(findId, 2);
    await h.run(findId, 3);

    expect(calls.map((c) => c.msg.kind)).toEqual(["email", "sms", "voice"]);
    const attempts = await db
      .select()
      .from(notificationAttempt)
      .where(eq(notificationAttempt.findId, findId))
      .orderBy(asc(notificationAttempt.attemptedAt));
    expect(attempts.map((a) => a.channelKind)).toEqual(["email", "sms", "voice"]);
    expect(attempts.every((a) => a.deliveryStatus === "sent")).toBe(true);

    const f = await db.select().from(find).where(eq(find.id, findId));
    expect(f[0]!.status).toBe("expired");
    expect(f[0]!.expiredAt).not.toBeNull();

    const audits = await db.select().from(auditEvent).where(eq(auditEvent.kind, "find.expired"));
    expect(audits).toHaveLength(1);
    expect(audits[0]!.payload).toMatchObject({ v: 1, findId, attemptsCount: 3 });

    const spend = await db.select().from(spendLedger).where(eq(spendLedger.caregiverId, caregiverId));
    const byKind = Object.fromEntries(spend.map((s) => [s.kind, s.costMinorUnits]));
    expect(byKind).toEqual({ sms: 9, voice: 35 });
  });
});
