import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import {
  auditEvent, caregiver, caregiverContact, device, find, notificationChannel, partner,
  protectedPerson, spendLedger, tag, tagBatch, user,
} from "../src/db/schema.js";
import { resetCaregiverTables } from "./helpers/db.js";

// Auth plumbing copied from caregiver.finds.test.ts (Better-Auth signup + cookie).
const PASSWORD = "correct-horse-battery-staple";

async function signupAndCookie(app: typeof import("../src/index.js")["app"], email: string) {
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ email, password: PASSWORD, name: email }),
    headers: { "content-type": "application/json" },
  });
  expect([200, 201]).toContain(res.status);
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("no set-cookie on signup");
  return setCookie
    .split(/,(?=\s*[a-zA-Z0-9_-]+=)/)
    .map((c) => c.split(";")[0]!.trim())
    .join("; ");
}

async function provision(app: typeof import("../src/index.js")["app"], email: string) {
  const cookie = await signupAndCookie(app, email);
  const me = await app.request("/api/caregiver/me", { headers: { cookie } });
  expect(me.status).toBe(200);
  const { caregiverId } = (await me.json()) as { caregiverId: string };
  return { cookie, caregiverId };
}

describe("caregiver LGPD export/delete (§5.6)", () => {
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

  // Full data footprint: contact, person, paired tag, find, channels, spend, device.
  async function seedFullData(cookie: string, caregiverId: string, email: string) {
    const contactRes = await app.request("/api/caregiver/contacts", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ kind: "phone", value: "+525512345678" }),
    });
    const contact = (await contactRes.json()) as { id: string };

    await app.request("/api/caregiver/people", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ nickname: `Kid of ${email}`, publicNote: "note" }),
    });

    const [p] = await db.insert(partner).values({ name: "Acme", billingEmail: "ops@acme.test" }).returning();
    const [b] = await db.insert(tagBatch).values({ partnerId: p!.id, size: 1 }).returning();
    const code = `EXP${email[0]!.toUpperCase()}1`;
    await db.insert(tag).values({ code, partnerId: p!.id, batchId: b!.id });
    const pair = await app.request(`/api/caregiver/tags/${code}/pair`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ contactId: contact.id, label: "jacket" }),
    });
    expect(pair.status).toBe(200);

    const [t] = await db.select().from(tag).where(eq(tag.code, code));
    await db.insert(find).values({ tagId: t!.id, locationKind: "address", addressText: `park near ${email}` });
    await db.insert(spendLedger).values({ caregiverId, day: "2026-01-01", kind: "sms", costMinorUnits: 9 });
    await db.insert(device).values({ caregiverId, platform: "ios", expoPushToken: `tok-${email}` });
    return { code, partnerId: p!.id };
  }

  it("GET /export returns the caregiver's full data and nobody else's", async () => {
    const { cookie, caregiverId } = await provision(app, "exporter@test.dev");
    await seedFullData(cookie, caregiverId, "exporter@test.dev");
    const { cookie: cookieB, caregiverId: cgB } = await provision(app, "other@test.dev");
    await seedFullData(cookieB, cgB, "other@test.dev");

    const res = await app.request("/api/caregiver/export", { headers: { cookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("attachment");
    const text = await res.text();
    const body = JSON.parse(text) as {
      v: number;
      account: { email: string } | null;
      contacts: unknown[];
      protectedPersons: unknown[];
      tags: unknown[];
      finds: unknown[];
      notificationChannels: unknown[];
      devices: unknown[];
      spendLedger: unknown[];
    };
    expect(body.v).toBe(1);
    expect(body.account!.email).toBe("exporter@test.dev");
    expect(body.contacts).toHaveLength(1);
    expect(body.protectedPersons).toHaveLength(1);
    expect(body.tags).toHaveLength(1);
    expect(body.finds).toHaveLength(1);
    expect(body.notificationChannels).toHaveLength(3);
    expect(body.devices).toHaveLength(1);
    expect(body.spendLedger).toHaveLength(1);
    expect(text).not.toContain("other@test.dev");

    const audits = await db.select().from(auditEvent).where(eq(auditEvent.kind, "caregiver.exported_data"));
    expect(audits).toHaveLength(1);
  });

  it("POST /account/delete with a wrong password returns 403 and deletes nothing", async () => {
    const { cookie, caregiverId } = await provision(app, "keepme@test.dev");
    await seedFullData(cookie, caregiverId, "keepme@test.dev");

    const res = await app.request("/api/caregiver/account/delete", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ password: "wrong-password-entirely" }),
    });
    expect(res.status).toBe(403);

    expect(await db.select().from(user)).toHaveLength(1);
    expect(await db.select().from(caregiver)).toHaveLength(1);
    expect(await db.select().from(caregiverContact)).toHaveLength(1);
    const audits = await db.select().from(auditEvent).where(eq(auditEvent.kind, "caregiver.deleted_account"));
    expect(audits).toHaveLength(0);
  });

  it("POST /account/delete cascades everything, keeps the audit trail, kills the session", async () => {
    const { cookie, caregiverId } = await provision(app, "deleteme@test.dev");
    const { partnerId } = await seedFullData(cookie, caregiverId, "deleteme@test.dev");

    const res = await app.request("/api/caregiver/account/delete", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ password: PASSWORD }),
    });
    expect(res.status).toBe(200);

    // Every caregiver-owned row is gone.
    expect(await db.select().from(user)).toHaveLength(0);
    expect(await db.select().from(caregiver)).toHaveLength(0);
    expect(await db.select().from(caregiverContact)).toHaveLength(0);
    expect(await db.select().from(protectedPerson)).toHaveLength(0);
    expect(await db.select().from(tag)).toHaveLength(0);
    expect(await db.select().from(find)).toHaveLength(0);
    expect(await db.select().from(notificationChannel)).toHaveLength(0);
    expect(await db.select().from(spendLedger)).toHaveLength(0);
    expect(await db.select().from(device)).toHaveLength(0);

    // The audit trail survives (no FKs by design), including the delete event.
    const audits = await db.select().from(auditEvent).where(eq(auditEvent.kind, "caregiver.deleted_account"));
    expect(audits).toHaveLength(1);
    expect(audits[0]!.caregiverId).toBe(caregiverId);
    expect(audits[0]!.payload).toMatchObject({ v: 1, caregiverId });

    // Partner-side data is untouched.
    const partners = await db.select().from(partner).where(eq(partner.id, partnerId));
    expect(partners).toHaveLength(1);

    // The deleted session is dead.
    const me = await app.request("/api/caregiver/me", { headers: { cookie } });
    expect(me.status).toBe(401);
  });
});
