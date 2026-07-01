import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { auditEvent, partner, tag, tagBatch } from "../src/db/schema.js";
import { resetCaregiverTables } from "./helpers/db.js";

// Sign up via Better-Auth and capture the Set-Cookie header for subsequent
// authenticated requests. Better-Auth's auto-sign-in returns the cookie
// directly on the sign-up response.
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
  // Take only the name=value portion of each Set-Cookie value (strip path/attrs).
  // app.request returns multiple cookies joined by ", " — split safely.
  const cookies = setCookie
    .split(/,(?=\s*[a-zA-Z0-9_-]+=)/)
    .map((c) => c.split(";")[0]!.trim())
    .join("; ");
  return cookies;
}

describe("caregiver router", () => {
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

  it("rejects /me without a session", async () => {
    const res = await app.request("/api/caregiver/me", { method: "GET" });
    expect(res.status).toBe(401);
  });

  it("creates caregiver row on first /me hit and logs caregiver.signup", async () => {
    const cookie = await signupAndCookie(app, "alice@example.com");
    const res = await app.request("/api/caregiver/me", {
      method: "GET",
      headers: { cookie },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { caregiverId: string; email: string };
    expect(body.email).toBe("alice@example.com");
    expect(body.caregiverId).toMatch(/^[0-9a-f-]{36}$/);
    const audits = await db
      .select()
      .from(auditEvent)
      .where(eq(auditEvent.kind, "caregiver.signup"));
    expect(audits).toHaveLength(1);
  });

  it("creates a protected person and lists it", async () => {
    const cookie = await signupAndCookie(app, "bob@example.com");
    const created = await app.request("/api/caregiver/people", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ nickname: "Granny", publicNote: "needs help getting home" }),
    });
    expect(created.status).toBe(201);
    const list = await app.request("/api/caregiver/people", { headers: { cookie } });
    const data = (await list.json()) as { people: { nickname: string }[] };
    expect(data.people.map((p) => p.nickname)).toEqual(["Granny"]);
  });

  it("pairs an inactive tag to a contact (single step inactive→registered)", async () => {
    const cookie = await signupAndCookie(app, "carol@example.com");
    const contactRes = await app.request("/api/caregiver/contacts", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ kind: "phone", value: "+525512345678" }),
    });
    const contact = (await contactRes.json()) as { id: string };

    // Seed a partner + batch + inactive tag.
    const [p] = await db.insert(partner).values({ name: "Acme", billingEmail: "ops@acme.test" }).returning();
    const [b] = await db.insert(tagBatch).values({ partnerId: p!.id, size: 1 }).returning();
    await db.insert(tag).values({ code: "TESTCODE1", partnerId: p!.id, batchId: b!.id });

    const pair = await app.request("/api/caregiver/tags/TESTCODE1/pair", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ contactId: contact.id, label: "blue jacket" }),
    });
    expect(pair.status).toBe(200);
    const body = (await pair.json()) as { state: string; label: string; contactId: string };
    expect(body.state).toBe("registered");
    expect(body.label).toBe("blue jacket");
    expect(body.contactId).toBe(contact.id);

    const audits = await db
      .select()
      .from(auditEvent)
      .where(eq(auditEvent.kind, "tag.registered"));
    expect(audits).toHaveLength(1);
    const payload = audits[0]!.payload as { contactId: string };
    expect(payload.contactId).toBe(contact.id);
  });

  it("pairs an active tag to a contact (active→registered)", async () => {
    const cookie = await signupAndCookie(app, "carol2@example.com");
    const contactRes = await app.request("/api/caregiver/contacts", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ kind: "phone", value: "+525512340000" }),
    });
    const contact = (await contactRes.json()) as { id: string };

    const [p] = await db.insert(partner).values({ name: "Acme-Active", billingEmail: "ops@acme.test" }).returning();
    const [b] = await db.insert(tagBatch).values({ partnerId: p!.id, size: 1 }).returning();
    await db.insert(tag).values({ code: "ACTIVECODE", partnerId: p!.id, batchId: b!.id, state: "active" });

    const pair = await app.request("/api/caregiver/tags/ACTIVECODE/pair", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ contactId: contact.id, label: "red hat" }),
    });
    expect(pair.status).toBe(200);
    const body = (await pair.json()) as { state: string; label: string; contactId: string };
    expect(body.state).toBe("registered");
    expect(body.label).toBe("red hat");
    expect(body.contactId).toBe(contact.id);
  });

  it("pair on already-registered tag returns 409 with current state", async () => {
    const cookie = await signupAndCookie(app, "dave@example.com");
    const contactRes = await app.request("/api/caregiver/contacts", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ kind: "phone", value: "+525512345678" }),
    });
    const contact = (await contactRes.json()) as { id: string };

    const [p] = await db.insert(partner).values({ name: "Acme2", billingEmail: "x@y.test" }).returning();
    const [b] = await db.insert(tagBatch).values({ partnerId: p!.id, size: 1 }).returning();
    await db.insert(tag).values({
      code: "ALREADYREG",
      partnerId: p!.id,
      batchId: b!.id,
      state: "registered",
    });

    const res = await app.request("/api/caregiver/tags/ALREADYREG/pair", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ contactId: contact.id }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; state: string };
    expect(body.state).toBe("registered");
  });

  it("pair rejects contact belonging to a different caregiver", async () => {
    const aliceCookie = await signupAndCookie(app, "alice2@example.com");
    const bobCookie = await signupAndCookie(app, "bob2@example.com");

    const aliceC = await app.request("/api/caregiver/contacts", {
      method: "POST",
      headers: { cookie: aliceCookie, "content-type": "application/json" },
      body: JSON.stringify({ kind: "phone", value: "+525512345678" }),
    });
    const aliceContact = (await aliceC.json()) as { id: string };

    const [p] = await db.insert(partner).values({ name: "Acme3", billingEmail: "x@y.test" }).returning();
    const [b] = await db.insert(tagBatch).values({ partnerId: p!.id, size: 1 }).returning();
    await db.insert(tag).values({ code: "OTHER", partnerId: p!.id, batchId: b!.id });

    const res = await app.request("/api/caregiver/tags/OTHER/pair", {
      method: "POST",
      headers: { cookie: bobCookie, "content-type": "application/json" },
      body: JSON.stringify({ contactId: aliceContact.id }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("contact_not_found");
  });
});
