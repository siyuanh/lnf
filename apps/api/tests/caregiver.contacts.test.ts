import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { auditEvent, caregiverContact, user } from "../src/db/schema.js";
import { resetCaregiverTables } from "./helpers/db.js";

// Duplicated deliberately: mirrors the helper in caregiver.test.ts so this
// suite stays self-contained. Merging into a shared file across tests can
// wait until a third caller shows up.
async function signupAndCookie(
  app: typeof import("../src/index.js")["app"],
  email: string,
  extras: Record<string, unknown> = {},
): Promise<string> {
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({
      email,
      password: "correct-horse-battery-staple",
      name: email,
      ...extras,
    }),
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

describe("caregiver contacts CRUD", () => {
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

  it("rejects contacts endpoints without a session", async () => {
    expect((await app.request("/api/caregiver/contacts")).status).toBe(401);
    expect(
      (await app.request("/api/caregiver/contacts", { method: "POST", body: "{}", headers: { "content-type": "application/json" } }))
        .status,
    ).toBe(401);
  });

  it("creates and lists a phone contact", async () => {
    const cookie = await signupAndCookie(app, "alice@example.com");
    const created = await app.request("/api/caregiver/contacts", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ kind: "phone", label: "cell", value: "+52 55 1234 5678" }),
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as { id: string; kind: string; label: string | null; value: string };
    expect(body.kind).toBe("phone");
    expect(body.label).toBe("cell");
    expect(body.value).toBe("+52 55 1234 5678");
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);

    const list = await app.request("/api/caregiver/contacts", { headers: { cookie } });
    const data = (await list.json()) as { contacts: { id: string; kind: string }[] };
    expect(data.contacts.map((c) => c.id)).toContain(body.id);

    const audits = await db
      .select()
      .from(auditEvent)
      .where(eq(auditEvent.kind, "caregiver.contact.created"));
    expect(audits).toHaveLength(1);
  });

  it("rejects invalid phone / email at the boundary", async () => {
    const cookie = await signupAndCookie(app, "bob@example.com");
    const badPhone = await app.request("/api/caregiver/contacts", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ kind: "phone", value: "not-a-phone" }),
    });
    expect(badPhone.status).toBe(400);

    const badEmail = await app.request("/api/caregiver/contacts", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ kind: "email", value: "notanemail" }),
    });
    expect(badEmail.status).toBe(400);
  });

  it("accepts address as free text", async () => {
    const cookie = await signupAndCookie(app, "carol@example.com");
    const res = await app.request("/api/caregiver/contacts", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ kind: "address", value: "Av. Reforma 123, CDMX" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { kind: string; value: string };
    expect(body.kind).toBe("address");
    expect(body.value).toBe("Av. Reforma 123, CDMX");
  });

  it("updates label + value; kind is immutable", async () => {
    const cookie = await signupAndCookie(app, "dave@example.com");
    const created = await app.request("/api/caregiver/contacts", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ kind: "phone", value: "+525512345678" }),
    });
    const { id } = (await created.json()) as { id: string };

    const patched = await app.request(`/api/caregiver/contacts/${id}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ label: "work", value: "+525587654321" }),
    });
    expect(patched.status).toBe(200);
    const body = (await patched.json()) as { label: string | null; value: string; kind: string };
    expect(body.label).toBe("work");
    expect(body.value).toBe("+525587654321");
    expect(body.kind).toBe("phone");

    const audits = await db
      .select()
      .from(auditEvent)
      .where(eq(auditEvent.kind, "caregiver.contact.updated"));
    expect(audits).toHaveLength(1);
  });

  it("PATCH with no changes → 400", async () => {
    const cookie = await signupAndCookie(app, "eve@example.com");
    const created = await app.request("/api/caregiver/contacts", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ kind: "email", value: "eve@work.example" }),
    });
    const { id } = (await created.json()) as { id: string };
    const patched = await app.request(`/api/caregiver/contacts/${id}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(patched.status).toBe(400);
  });

  it("soft-deletes and drops the row from the list", async () => {
    const cookie = await signupAndCookie(app, "fred@example.com");
    const created = await app.request("/api/caregiver/contacts", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ kind: "phone", value: "+525512345678" }),
    });
    const { id } = (await created.json()) as { id: string };

    const del = await app.request(`/api/caregiver/contacts/${id}`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(del.status).toBe(204);

    const list = await app.request("/api/caregiver/contacts", { headers: { cookie } });
    const data = (await list.json()) as { contacts: { id: string }[] };
    expect(data.contacts.map((c) => c.id)).not.toContain(id);

    // Row should still exist with deleted_at set — soft delete keeps audit
    // continuity.
    const rows = await db
      .select({ deletedAt: caregiverContact.deletedAt })
      .from(caregiverContact)
      .where(eq(caregiverContact.id, id));
    expect(rows[0]?.deletedAt).not.toBeNull();

    const audits = await db
      .select()
      .from(auditEvent)
      .where(eq(auditEvent.kind, "caregiver.contact.deleted"));
    expect(audits).toHaveLength(1);
  });

  it("cannot PATCH or DELETE another caregiver's contact", async () => {
    const aliceCookie = await signupAndCookie(app, "alice2@example.com");
    const bobCookie = await signupAndCookie(app, "bob2@example.com");

    const created = await app.request("/api/caregiver/contacts", {
      method: "POST",
      headers: { cookie: aliceCookie, "content-type": "application/json" },
      body: JSON.stringify({ kind: "email", value: "alice@work.example" }),
    });
    const { id } = (await created.json()) as { id: string };

    const patched = await app.request(`/api/caregiver/contacts/${id}`, {
      method: "PATCH",
      headers: { cookie: bobCookie, "content-type": "application/json" },
      body: JSON.stringify({ value: "hijack@evil.example" }),
    });
    expect(patched.status).toBe(404);

    const del = await app.request(`/api/caregiver/contacts/${id}`, {
      method: "DELETE",
      headers: { cookie: bobCookie },
    });
    expect(del.status).toBe(404);

    // Alice's row is intact.
    const bobList = await app.request("/api/caregiver/contacts", { headers: { cookie: bobCookie } });
    expect(((await bobList.json()) as { contacts: unknown[] }).contacts).toHaveLength(0);
    const aliceList = await app.request("/api/caregiver/contacts", { headers: { cookie: aliceCookie } });
    expect(((await aliceList.json()) as { contacts: unknown[] }).contacts).toHaveLength(1);
  });

  it("captures phone on signup as user.phone", async () => {
    await signupAndCookie(app, "greta@example.com", { phone: "+525512345678" });
    const rows = await db.select({ phone: user.phone }).from(user).where(eq(user.email, "greta@example.com"));
    expect(rows[0]?.phone).toBe("+525512345678");
  });
});
