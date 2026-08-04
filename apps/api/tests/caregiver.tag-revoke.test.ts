import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { and, eq } from "drizzle-orm";
import { auditEvent, partner, tag, tagBatch } from "../src/db/schema.js";
import { resetCaregiverTables } from "./helpers/db.js";

// Auth plumbing copied from caregiver.alert-handling.test.ts (Better-Auth signup + cookie).
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
}

describe("caregiver tag revoke (UC-6)", () => {
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

  async function seedTag(code: string, state: "inactive" | "active" | "registered" | "deprecated" = "inactive") {
    const [p] = await db.insert(partner).values({ name: "Acme", billingEmail: "ops@acme.test" }).returning();
    const [b] = await db.insert(tagBatch).values({ partnerId: p!.id, size: 1 }).returning();
    await db.insert(tag).values({ code, partnerId: p!.id, batchId: b!.id, state });
  }

  async function tagRow(code: string) {
    const [t] = await db.select().from(tag).where(eq(tag.code, code));
    return t!;
  }

  it("revokes a registered owned tag: state flips, deprecatedAt set, audit row written", async () => {
    const { cookie, caregiverId } = await provision(app, "revoker@test.dev");
    await seedTag("REV1");
    await pairTag(app, cookie, "REV1");

    const res = await app.request("/api/caregiver/tags/REV1/revoke", { method: "POST", headers: { cookie } });
    expect(res.status).toBe(200);
    expect((await res.json()) as { state: string }).toEqual({ code: "REV1", state: "deprecated" });

    const row = await tagRow("REV1");
    expect(row.state).toBe("deprecated");
    expect(row.deprecatedAt).not.toBeNull();

    const audits = await db
      .select()
      .from(auditEvent)
      .where(and(eq(auditEvent.kind, "tag.deprecated"), eq(auditEvent.caregiverId, caregiverId)));
    expect(audits).toHaveLength(1);
  });

  it("is idempotent: a second revoke returns 200 without a new state change or audit row", async () => {
    const { cookie, caregiverId } = await provision(app, "twice@test.dev");
    await seedTag("REV2");
    await pairTag(app, cookie, "REV2");

    for (let i = 0; i < 2; i++) {
      const res = await app.request("/api/caregiver/tags/REV2/revoke", { method: "POST", headers: { cookie } });
      expect(res.status).toBe(200);
    }

    const row = await tagRow("REV2");
    expect(row.state).toBe("deprecated");
    const audits = await db
      .select()
      .from(auditEvent)
      .where(and(eq(auditEvent.kind, "tag.deprecated"), eq(auditEvent.caregiverId, caregiverId)));
    expect(audits).toHaveLength(1);
  });

  it("404s on a tag owned by another caregiver and leaves it untouched", async () => {
    const owner = await provision(app, "owner@test.dev");
    const intruder = await provision(app, "intruder@test.dev");
    await seedTag("REV3");
    await pairTag(app, owner.cookie, "REV3");

    const res = await app.request("/api/caregiver/tags/REV3/revoke", { method: "POST", headers: { cookie: intruder.cookie } });
    expect(res.status).toBe(404);
    expect((await tagRow("REV3")).state).toBe("registered");
  });

  it("404s on unknown and never-paired codes", async () => {
    const { cookie } = await provision(app, "ghost@test.dev");
    await seedTag("REV4"); // inactive, no caregiverId — indistinguishable from unknown

    for (const code of ["NOPE", "REV4"]) {
      const res = await app.request(`/api/caregiver/tags/${code}/revoke`, { method: "POST", headers: { cookie } });
      expect(res.status).toBe(404);
    }
    expect((await tagRow("REV4")).state).toBe("inactive");
  });

  it("a revoked tag disappears from the caregiver's tag list and rejects finds", async () => {
    const { cookie } = await provision(app, "lister@test.dev");
    await seedTag("REV5");
    await pairTag(app, cookie, "REV5");
    await app.request("/api/caregiver/tags/REV5/revoke", { method: "POST", headers: { cookie } });

    const list = (await (
      await app.request("/api/caregiver/tags", { headers: { cookie } })
    ).json()) as { tags: { code: string }[] };
    expect(list.tags.map((t) => t.code)).not.toContain("REV5");

    const findRes = await app.request("/api/public/tag/REV5/find", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ location: { kind: "address", text: "el parque" } }),
    });
    expect(findRes.status).toBe(409);
  });
});
