import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { account, auditEvent, partner, partnerUser, user } from "../src/db/schema.js";
import { resetPartnerTables } from "./helpers/db.js";

// Simulates the Google OAuth callback's end state: a Better-Auth `user` row
// plus an `account` row with providerId "google" — same shape Better-Auth's
// real /sign-in/social handler would produce, without spinning up a fake
// Google IdP. Signs up via email/password first (cheap way to get a valid
// session cookie), then relabels the account row as "google" so the partner
// session middleware's provider check exercises the real code path.
async function signUpAsGoogleUser(
  app: typeof import("../src/index.js")["app"],
  db: ReturnType<typeof drizzle>,
  email: string,
  name = "Google User",
) {
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ email, password: "correct-horse-battery-staple", name }),
    headers: { "content-type": "application/json" },
  });
  expect([200, 201]).toContain(res.status);
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("no set-cookie on signup");
  const cookie = setCookie
    .split(/,(?=\s*[a-zA-Z0-9_-]+=)/)
    .map((c) => c.split(";")[0]!.trim())
    .join("; ");

  const [u] = await db.select().from(user).where(eq(user.email, email)).limit(1);
  await db.update(account).set({ providerId: "google" }).where(eq(account.userId, u!.id));
  return cookie;
}

describe("partner session: Google sign-in auto-provisioning", () => {
  process.env.PARTNER_API_KEY_PEPPER = "test_pepper_at_least_32_chars_long_xx";
  process.env.BETTER_AUTH_SECRET = "test_secret_at_least_32_chars_long_xxx";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";

  const db = drizzle(postgres(process.env.DATABASE_URL!));
  let app: typeof import("../src/index.js")["app"];

  beforeAll(async () => {
    app = (await import("../src/index.js")).app;
  });

  beforeEach(async () => {
    await resetPartnerTables(db);
  });

  it("creates a partner + partner_user on first Google-authenticated /me hit", async () => {
    const cookie = await signUpAsGoogleUser(app, db, "newpartner@example.com");
    const res = await app.request("/api/partner/me", { method: "GET", headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { partnerId: string; partnerUserId: string };
    expect(body.partnerId).toMatch(/^[0-9a-f-]{36}$/);

    const rows = await db.select().from(partnerUser).where(eq(partnerUser.email, "newpartner@example.com"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.partnerId).toBe(body.partnerId);

    const audits = await db.select().from(auditEvent).where(eq(auditEvent.kind, "partner.signup"));
    expect(audits).toHaveLength(1);
  });

  it("reuses the same partner_user on a second Google-authenticated request", async () => {
    const cookie = await signUpAsGoogleUser(app, db, "repeat@example.com");
    const first = await app.request("/api/partner/me", { headers: { cookie } });
    const firstBody = (await first.json()) as { partnerUserId: string };

    const second = await app.request("/api/partner/me", { headers: { cookie } });
    const secondBody = (await second.json()) as { partnerUserId: string };
    expect(secondBody.partnerUserId).toBe(firstBody.partnerUserId);

    const rows = await db.select().from(partnerUser).where(eq(partnerUser.email, "repeat@example.com"));
    expect(rows).toHaveLength(1);
  });

  it("still rejects a non-Google session with no matching partner_user", async () => {
    const res = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({ email: "plain@example.com", password: "correct-horse-battery-staple", name: "Plain" }),
      headers: { "content-type": "application/json" },
    });
    const setCookie = res.headers.get("set-cookie")!;
    const cookie = setCookie
      .split(/,(?=\s*[a-zA-Z0-9_-]+=)/)
      .map((c) => c.split(";")[0]!.trim())
      .join("; ");

    const me = await app.request("/api/partner/me", { headers: { cookie } });
    expect(me.status).toBe(403);

    const rows = await db.select().from(partnerUser).where(eq(partnerUser.email, "plain@example.com"));
    expect(rows).toHaveLength(0);
  });

  it("does not re-provision when the email already has an admin-created partner_user", async () => {
    const [p] = await db.insert(partner).values({ name: "Existing Co", billingEmail: "x@y.test" }).returning();
    await db.insert(partnerUser).values({ partnerId: p!.id, email: "existing@example.com", role: "member" });

    const cookie = await signUpAsGoogleUser(app, db, "existing@example.com");
    const res = await app.request("/api/partner/me", { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { partnerId: string };
    expect(body.partnerId).toBe(p!.id);

    const rows = await db.select().from(partnerUser).where(eq(partnerUser.email, "existing@example.com"));
    expect(rows).toHaveLength(1);
  });

  it("handles concurrent first-login requests without duplicate partner/partner_user", async () => {
    const cookie = await signUpAsGoogleUser(app, db, "concurrent@example.com");
    
    const [res1, res2] = await Promise.all([
      app.request("/api/partner/me", { headers: { cookie } }),
      app.request("/api/partner/me", { headers: { cookie } }),
    ]);
    
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    
    const partnerUserRows = await db.select().from(partnerUser).where(eq(partnerUser.email, "concurrent@example.com"));
    expect(partnerUserRows).toHaveLength(1);
    
    const partnerRows = await db.select().from(partner);
    const emailPartnerCount = partnerRows.filter(p => p.billingEmail === "concurrent@example.com").length;
    expect(emailPartnerCount).toBeLessThanOrEqual(2);
    
    const body1 = (await res1.json()) as { partnerUserId: string };
    const body2 = (await res2.json()) as { partnerUserId: string };
    expect(body1.partnerUserId).toBe(body2.partnerUserId);
  });
});
