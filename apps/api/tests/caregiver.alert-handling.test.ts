import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { auditEvent, find, partner, tag, tagBatch } from "../src/db/schema.js";
import { resetCaregiverTables } from "./helpers/db.js";

// Auth plumbing copied from caregiver.finds.test.ts (Better-Auth signup + cookie).
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

describe("caregiver alert handling (§5.7)", () => {
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

  async function seedRegisteredTag(code: string) {
    const [p] = await db.insert(partner).values({ name: "Acme", billingEmail: "ops@acme.test" }).returning();
    const [b] = await db.insert(tagBatch).values({ partnerId: p!.id, size: 1 }).returning();
    await db.insert(tag).values({ code, partnerId: p!.id, batchId: b!.id });
  }

  async function seedFindOnTag(code: string, over: Partial<typeof find.$inferInsert> = {}) {
    const [t] = await db.select().from(tag).where(eq(tag.code, code));
    const [f] = await db
      .insert(find)
      .values({ tagId: t!.id, locationKind: "address", addressText: "el parque", ...over })
      .returning();
    return f!;
  }

  it("GET /finds?tag= scopes the history to one tag and includes closed finds", async () => {
    const { cookie } = await provision(app, "hist@test.dev");
    await seedRegisteredTag("HIST1");
    await seedRegisteredTag("HIST2");
    await pairTag(app, cookie, "HIST1");
    await pairTag(app, cookie, "HIST2");
    const open = await seedFindOnTag("HIST1");
    await seedFindOnTag("HIST1", { status: "resolved", resolvedAt: new Date() });
    await seedFindOnTag("HIST2");

    const all = await (await app.request("/api/caregiver/finds", { headers: { cookie } })).json() as { finds: { tagCode: string }[] };
    expect(all.finds).toHaveLength(3);

    const scoped = await (
      await app.request("/api/caregiver/finds?tag=HIST1", { headers: { cookie } })
    ).json() as { finds: { tagCode: string; status: string }[] };
    expect(scoped.finds).toHaveLength(2);
    expect(scoped.finds.every((f) => f.tagCode === "HIST1")).toBe(true);
    // History, not just open: the resolved find is listed too.
    expect(scoped.finds.map((f) => f.status).sort()).toEqual(["reported", "resolved"]);
    expect(scoped.finds[0]!.tagCode).not.toBe(open.tagId); // ids differ from codes
  });

  it("POST /finds/:id/resolve closes reported and expired finds, idempotently", async () => {
    const { cookie } = await provision(app, "resolver@test.dev");
    await seedRegisteredTag("RES1");
    await pairTag(app, cookie, "RES1");
    const f1 = await seedFindOnTag("RES1");
    const f2 = await seedFindOnTag("RES1", { status: "expired", expiredAt: new Date() });

    for (const target of [f1, f2]) {
      const res = await app.request(`/api/caregiver/finds/${target.id}/resolve`, { method: "POST", headers: { cookie } });
      expect(res.status).toBe(200);
    }
    const rows = await db.select().from(find);
    expect(rows.every((r) => r.status === "resolved")).toBe(true);
    expect(rows.every((r) => r.resolvedAt !== null)).toBe(true);

    // Idempotent: second resolve is ok and writes no extra audit.
    const again = await app.request(`/api/caregiver/finds/${f1.id}/resolve`, { method: "POST", headers: { cookie } });
    expect(again.status).toBe(200);
    const audits = await db.select().from(auditEvent).where(eq(auditEvent.kind, "find.resolved"));
    expect(audits).toHaveLength(2);
  });

  it("POST /finds/:id/false-positive marks and audits", async () => {
    const { cookie } = await provision(app, "fp@test.dev");
    await seedRegisteredTag("FP1");
    await pairTag(app, cookie, "FP1");
    const f = await seedFindOnTag("FP1");

    const res = await app.request(`/api/caregiver/finds/${f.id}/false-positive`, { method: "POST", headers: { cookie } });
    expect(res.status).toBe(200);
    const rows = await db.select().from(find).where(eq(find.id, f.id));
    expect(rows[0]!.status).toBe("false_positive");
    expect(rows[0]!.resolvedAt).not.toBeNull();
    const audits = await db.select().from(auditEvent).where(eq(auditEvent.kind, "find.false_positive"));
    expect(audits).toHaveLength(1);
    expect(audits[0]!.payload).toMatchObject({ v: 1, findId: f.id });
  });

  it("finder contact stays hidden until acknowledgement (§5.6)", async () => {
    const { cookie } = await provision(app, "privacy@test.dev");
    await seedRegisteredTag("PRV1");
    await pairTag(app, cookie, "PRV1");
    const f = await seedFindOnTag("PRV1", { finderContact: "+521550000000" });

    const before = await (
      await app.request("/api/caregiver/finds", { headers: { cookie } })
    ).json() as { finds: { finderContact: string | null; status: string }[] };
    expect(before.finds[0]!.status).toBe("reported");
    expect(before.finds[0]!.finderContact).toBeNull();

    const ack = await app.request(`/api/caregiver/finds/${f.id}/ack`, { method: "POST", headers: { cookie } });
    expect(ack.status).toBe(200);

    const after = await (
      await app.request("/api/caregiver/finds", { headers: { cookie } })
    ).json() as { finds: { finderContact: string | null }[] };
    expect(after.finds[0]!.finderContact).toBe("+521550000000");
  });

  it("caregiver B cannot resolve caregiver A's find (404)", async () => {
    const { cookie: cookieA } = await provision(app, "owna@test.dev");
    await seedRegisteredTag("OWN1");
    await pairTag(app, cookieA, "OWN1");
    const f = await seedFindOnTag("OWN1");

    const { cookie: cookieB } = await provision(app, "ownb@test.dev");
    const res = await app.request(`/api/caregiver/finds/${f.id}/resolve`, { method: "POST", headers: { cookie: cookieB } });
    expect(res.status).toBe(404);
    const rows = await db.select().from(find).where(eq(find.id, f.id));
    expect(rows[0]!.status).toBe("reported");
  });

  it("false-positive mark rate-limits the same fingerprint on the same tag (§5.7)", async () => {
    await seedRegisteredTag("THR1");
    const [t0] = await db.select().from(tag).where(eq(tag.code, "THR1"));
    await db.update(tag).set({ state: "registered" }).where(eq(tag.id, t0!.id));

    const post = (ip?: string) =>
      app.request("/api/public/tag/THR1/find", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(ip ? { "x-forwarded-for": ip } : {}),
        },
        body: JSON.stringify({ location: { kind: "address", text: "el parque" } }),
      });

    // First report from this IP goes through.
    const first = await post("1.2.3.4");
    expect(first.status).toBe(200);
    const { findId } = (await first.json()) as { findId: string };

    // Caregiver marks it false-positive — the 1h throttle window opens.
    await db.update(find).set({ status: "false_positive", resolvedAt: new Date() }).where(eq(find.id, findId));

    // Same IP is throttled; a different IP is not; no fingerprint is not.
    expect((await post("1.2.3.4")).status).toBe(429);
    expect((await post("5.6.7.8")).status).toBe(200);
    expect((await post()).status).toBe(200);

    // Window runs from the mark: a mark 2h old no longer throttles.
    await db
      .update(find)
      .set({ resolvedAt: new Date(Date.now() - 2 * 3600 * 1000) })
      .where(eq(find.id, findId));
    expect((await post("1.2.3.4")).status).toBe(200);
  });
});
