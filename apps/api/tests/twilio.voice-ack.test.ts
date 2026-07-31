import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { caregiver, find, notificationAttempt, partner, tag, tagBatch, user } from "../src/db/schema.js";
import { resetCaregiverTables } from "./helpers/db.js";
import { signAckAttempt } from "../src/notify/ack-token.js";

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
});

async function seedVoiceAttempt() {
  const [u] = await db.insert(user).values({ id: crypto.randomUUID(), email: "cg@test.dev" }).returning();
  const [cg] = await db.insert(caregiver).values({ userId: u!.id }).returning();
  const [p] = await db.insert(partner).values({ name: "Acme", billingEmail: "ops@acme.test" }).returning();
  const [b] = await db.insert(tagBatch).values({ partnerId: p!.id, size: 1 }).returning();
  const [t] = await db.insert(tag).values({ code: "VOX1", partnerId: p!.id, batchId: b!.id, state: "registered", caregiverId: cg!.id }).returning();
  const [f] = await db.insert(find).values({ tagId: t!.id, locationKind: "address", addressText: "el parque" }).returning();
  const [a] = await db.insert(notificationAttempt).values({
    findId: f!.id, channelKind: "voice", channelTarget: "+5215512345678", deliveryStatus: "sent",
  }).returning();
  return { findId: f!.id, attemptId: a!.id };
}

describe("POST /api/webhooks/twilio/voice-ack", () => {
  it("digit 1 acknowledges and speaks confirmation", async () => {
    const { findId, attemptId } = await seedVoiceAttempt();
    const token = signAckAttempt(attemptId, process.env.BETTER_AUTH_SECRET!);
    const res = await app.request(
      `/api/webhooks/twilio/voice-ack?attempt=${attemptId}&token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ Digits: "1" }).toString(),
      },
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Confirmamos");

    const f = await db.select().from(find).where(eq(find.id, findId));
    expect(f[0]!.status).toBe("acknowledged");
  });

  it("wrong digit re-prompts with a retry counter (§4.3 #24)", async () => {
    const { attemptId } = await seedVoiceAttempt();
    const token = signAckAttempt(attemptId, process.env.BETTER_AUTH_SECRET!);
    const res = await app.request(
      `/api/webhooks/twilio/voice-ack?attempt=${attemptId}&tries=2&token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ Digits: "9" }).toString(),
      },
    );
    const body = await res.text();
    expect(body).toContain("Gather"); // still listening
    expect(body).toContain("tries=3"); // third and final attempt
  });

  it("garbage retry counter restarts at 1 instead of looping on NaN", async () => {
    const { attemptId } = await seedVoiceAttempt();
    const token = signAckAttempt(attemptId, process.env.BETTER_AUTH_SECRET!);
    const res = await app.request(
      `/api/webhooks/twilio/voice-ack?attempt=${attemptId}&tries=garbage&token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ Digits: "9" }).toString(),
      },
    );
    const body = await res.text();
    expect(body).toContain("Gather");
    expect(body).toContain("tries=2");
    expect(body).not.toContain("NaN");
  });

  it("bad token returns 401 and no TwiML", async () => {
    const { attemptId } = await seedVoiceAttempt();
    const res = await app.request(`/api/webhooks/twilio/voice-ack?attempt=${attemptId}&token=bogus`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ Digits: "1" }).toString(),
    });
    expect(res.status).toBe(401);
  });
});
