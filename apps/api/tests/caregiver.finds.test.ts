import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { auditEvent, find, notificationChannel, partner, tag, tagBatch } from "../src/db/schema.js";
import { resetCaregiverTables } from "./helpers/db.js";

// Sign up via Better-Auth and capture the Set-Cookie header for subsequent
// authenticated requests (copied from caregiver.test.ts — do not invent new auth).
async function signupAndCookie(
  app: typeof import("../src/index.js")["app"],
  email: string,
  password = "correct-horse-battery-staple",
) {
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ email, password, name: email }),
    headers: { "content-type": "application/json" },
  });
  expect([200, 201]).toContain(res.status);
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("no set-cookie on signup");
  const cookies = setCookie
    .split(/,(?=\s*[a-zA-Z0-9_-]+=)/)
    .map((c) => c.split(";")[0]!.trim())
    .join("; ");
  return cookies;
}

// First /me hit auto-provisions the caregiver row (caregiver-session middleware).
async function provision(app: typeof import("../src/index.js")["app"], email: string) {
  const cookie = await signupAndCookie(app, email);
  const me = await app.request("/api/caregiver/me", { headers: { cookie } });
  expect(me.status).toBe(200);
  const { caregiverId } = (await me.json()) as { caregiverId: string };
  return { cookie, caregiverId };
}

async function pairTag(app: typeof import("../src/index.js")["app"], cookie: string, code: string) {
  const contactRes = await app.request("/api/caregiver/contacts", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ kind: "phone", value: "+525512345678" }),
  });
  const contact = (await contactRes.json()) as { id: string };
  const pair = await app.request(`/api/caregiver/tags/${code}/pair`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ contactId: contact.id, label: "blue jacket" }),
  });
  expect(pair.status).toBe(200);
  return contact;
}

describe("caregiver finds endpoints", () => {
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

  async function seedPartnerTag(code: string) {
    const [p] = await db.insert(partner).values({ name: "Acme", billingEmail: "ops@acme.test" }).returning();
    const [b] = await db.insert(tagBatch).values({ partnerId: p!.id, size: 1 }).returning();
    await db.insert(tag).values({ code, partnerId: p!.id, batchId: b!.id });
  }

  it("pairing a tag bootstraps default channels (email + sms + voice)", async () => {
    const { cookie } = await provision(app, "cg@test.dev");
    await seedPartnerTag("BOOT1");
    await pairTag(app, cookie, "BOOT1");

    const channels = await db.select().from(notificationChannel);
    expect(channels.map((ch) => ch.kind)).toEqual(["email", "sms", "voice"]);
    expect(channels[0]!.target).toBe("cg@test.dev"); // account email
    expect(channels[1]!.escalationDelaySeconds).toBe(300);
    expect(channels[2]!.escalationDelaySeconds).toBe(0);
  });

  it("GET /api/caregiver/finds lists open finds with collapsed counts", async () => {
    const { cookie, caregiverId } = await provision(app, "finds@test.dev");
    await seedPartnerTag("LIST1");
    await pairTag(app, cookie, "LIST1");
    const [t] = await db.select().from(tag).where(eq(tag.code, "LIST1"));
    expect(t!.caregiverId).toBe(caregiverId);
    const [f1] = await db.insert(find).values({ tagId: t!.id, locationKind: "address", addressText: "el parque" }).returning();
    await db.insert(find).values({ tagId: t!.id, locationKind: "gps", lat: "19.4", lon: "-99.1", isCollapsedInto: f1!.id });

    const res = await app.request("/api/caregiver/finds", { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { finds: { status: string; collapsedCount: number }[] };
    expect(body.finds).toHaveLength(1);
    expect(body.finds[0]).toMatchObject({ status: "reported", collapsedCount: 1 });
  });

  it("POST /api/caregiver/finds/:id/ack acks from the app (§5.7), idempotently", async () => {
    const { cookie } = await provision(app, "acker@test.dev");
    await seedPartnerTag("ACKT1");
    await pairTag(app, cookie, "ACKT1");
    const [t] = await db.select().from(tag).where(eq(tag.code, "ACKT1"));
    const [f] = await db.insert(find).values({ tagId: t!.id, locationKind: "gps", lat: "19.43", lon: "-99.13" }).returning();

    const res = await app.request(`/api/caregiver/finds/${f!.id}/ack`, { method: "POST", headers: { cookie } });
    expect(res.status).toBe(200);
    const rows = await db.select().from(find).where(eq(find.id, f!.id));
    expect(rows[0]!.status).toBe("acknowledged");

    const audits = await db.select().from(auditEvent).where(eq(auditEvent.kind, "find.acknowledged"));
    expect(audits).toHaveLength(1);
    expect(audits[0]!.payload).toMatchObject({ v: 1, channelKind: "app", attemptId: null });

    // Plan self-review #2: a repeat ack of an own find is idempotent — ok, not 404.
    const again = await app.request(`/api/caregiver/finds/${f!.id}/ack`, { method: "POST", headers: { cookie } });
    expect(again.status).toBe(200);
  });

  it("caregiver B cannot ack caregiver A's find (404, §5.1 L3)", async () => {
    const { cookie: cookieA } = await provision(app, "a@test.dev");
    await seedPartnerTag("OWN1");
    await pairTag(app, cookieA, "OWN1");
    const [t] = await db.select().from(tag).where(eq(tag.code, "OWN1"));
    const [f] = await db.insert(find).values({ tagId: t!.id, locationKind: "address", addressText: "x" }).returning();

    const { cookie: cookieB } = await provision(app, "b@test.dev");
    const res = await app.request(`/api/caregiver/finds/${f!.id}/ack`, { method: "POST", headers: { cookie: cookieB } });
    expect(res.status).toBe(404);
    const rows = await db.select().from(find).where(eq(find.id, f!.id));
    expect(rows[0]!.status).toBe("reported");
  });
});
