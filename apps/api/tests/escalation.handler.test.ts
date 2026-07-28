import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import {
  caregiver, find, notificationAttempt, notificationChannel, partner, tag, tagBatch, user,
} from "../src/db/schema.js";
import { resetCaregiverTables } from "./helpers/db.js";
import { makeFakeSenders } from "../src/notify/senders.js";
import { makeHarness } from "./helpers/escalation.js";
import type { Db } from "../src/db/client.js";

process.env.PARTNER_API_KEY_PEPPER = "test_pepper_at_least_32_chars_long_xx";
process.env.BETTER_AUTH_SECRET = "test_secret_at_least_32_chars_long_xxx";
process.env.BETTER_AUTH_URL = "http://localhost:3000";

const db = drizzle(postgres(process.env.DATABASE_URL!));

async function seedFindWithChannels(kinds: ("email" | "sms" | "voice")[]) {
  const [u] = await db.insert(user).values({ id: crypto.randomUUID(), email: "cg@test.dev" }).returning();
  const [cg] = await db.insert(caregiver).values({ userId: u!.id }).returning();
  const [p] = await db.insert(partner).values({ name: "Acme", billingEmail: "ops@acme.test" }).returning();
  const [b] = await db.insert(tagBatch).values({ partnerId: p!.id, size: 1 }).returning();
  const [t] = await db.insert(tag).values({ code: "ESC1", partnerId: p!.id, batchId: b!.id, state: "registered", caregiverId: cg!.id }).returning();
  const [f] = await db.insert(find).values({ tagId: t!.id, locationKind: "address", addressText: "el parque" }).returning();
  for (const [i, kind] of kinds.entries()) {
    await db.insert(notificationChannel).values({
      caregiverId: cg!.id,
      kind,
      target: kind === "email" ? "cg@test.dev" : "+5215512345678",
      priority: i,
      escalationDelaySeconds: kind === "voice" ? 0 : 300,
    });
  }
  return { caregiverId: cg!.id, findId: f!.id };
}

function deps(calls: ReturnType<typeof makeFakeSenders>["calls"]) {
  // The fake records into the caller's array — the plan's "// shared call log"
  // intent; a push-spread here would only copy the empty initial state.
  const fake = makeFakeSenders({ calls });
  return {
    db: db as unknown as Db,
    senders: fake.senders,
    ackSecret: "test_ack_secret_at_least_32_chars_xxx",
    publicBaseUrl: "https://api.test",
    spendCapDailyMinor: 500,
  };
}

describe("escalate_find handler (§3.5)", () => {
  beforeEach(async () => {
    await resetCaregiverTables(db);
  });

  it("step 0 sends first channel, logs attempt, schedules step 1 with its delay", async () => {
    const { findId } = await seedFindWithChannels(["email", "sms"]);
    const calls: ReturnType<typeof makeFakeSenders>["calls"] = [];
    const h = makeHarness(deps(calls));
    await h.run(findId, 0);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.msg.kind).toBe("email");
    expect(calls[0]!.msg.text).toContain("https://api.test/api/public/ack/");

    const attempts = await db.select().from(notificationAttempt).where(eq(notificationAttempt.findId, findId));
    expect(attempts).toHaveLength(1);
    expect(attempts[0]!.channelKind).toBe("email");
    expect(attempts[0]!.deliveryStatus).toBe("sent");
    expect(attempts[0]!.ackLinkExpiresAt).not.toBeNull();

    expect(h.scheduled).toEqual([{ payload: { findId, step: 1 }, runAt: expect.any(Date) }]);
    const delaySec = (h.scheduled[0]!.runAt!.getTime() - Date.now()) / 1000;
    expect(delaySec).toBeGreaterThan(250);
  });

  it("no-ops when the find was acknowledged before this step ran", async () => {
    const { findId } = await seedFindWithChannels(["email", "sms"]);
    await db.update(find).set({ status: "acknowledged", acknowledgedAt: new Date() }).where(eq(find.id, findId));
    const calls: ReturnType<typeof makeFakeSenders>["calls"] = [];
    const h = makeHarness(deps(calls));
    await h.run(findId, 1);
    expect(calls).toHaveLength(0);
    expect(h.scheduled).toHaveLength(0);
  });

  it("marks the find expired when channels are exhausted", async () => {
    const { findId } = await seedFindWithChannels(["email"]);
    const calls: ReturnType<typeof makeFakeSenders>["calls"] = [];
    const h = makeHarness(deps(calls));
    await h.run(findId, 1); // step 1 with only one channel
    const rows = await db.select().from(find).where(eq(find.id, findId));
    expect(rows[0]!.status).toBe("expired");
    expect(rows[0]!.expiredAt).not.toBeNull();
    expect(h.scheduled).toHaveLength(0);
  });

  it("advances immediately on provider failure (no retry, §4.3 #19)", async () => {
    const { findId } = await seedFindWithChannels(["sms", "voice"]);
    const fake = makeFakeSenders({ failKinds: ["sms"] });
    const h = makeHarness({ ...deps([]), senders: fake.senders });
    await h.run(findId, 0);
    const attempts = await db.select().from(notificationAttempt).where(eq(notificationAttempt.findId, findId));
    expect(attempts[0]!.deliveryStatus).toBe("failed");
    expect(h.scheduled).toHaveLength(1);
    // Immediate advance: run_at ~ now, not +300s
    expect(h.scheduled[0]!.runAt).toBeUndefined();
  });

  it("skips SMS on spend-cap, logs spend_cap, advances immediately (§4.3 #20)", async () => {
    const { findId, caregiverId } = await seedFindWithChannels(["sms", "voice"]);
    const { spendLedger } = await import("../src/db/schema.js");
    await db.insert(spendLedger).values({
      caregiverId, day: new Date().toISOString().slice(0, 10), kind: "sms", costMinorUnits: 500,
    });
    const h = makeHarness(deps([]));
    await h.run(findId, 0);
    const attempts = await db.select().from(notificationAttempt).where(eq(notificationAttempt.findId, findId));
    expect(attempts[0]!.failureReason).toBe("spend_cap");
    expect(h.scheduled[0]!.runAt).toBeUndefined();
  });
});
