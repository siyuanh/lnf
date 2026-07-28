import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { find, partner, tag, tagBatch } from "../src/db/schema.js";
import { resetFindTables } from "./helpers/db.js";

describe("POST /api/public/tag/:code/find — escalation enqueue (S1-1)", () => {
  process.env.PARTNER_API_KEY_PEPPER = "test_pepper_at_least_32_chars_long_xx";
  process.env.BETTER_AUTH_SECRET = "test_secret_at_least_32_chars_long_xxx";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";

  const db = drizzle(postgres(process.env.DATABASE_URL!));
  let app: typeof import("../src/index.js")["app"];

  beforeAll(async () => {
    app = (await import("../src/index.js")).app;
  });

  beforeEach(async () => {
    await resetFindTables(db);
    // graphile_worker.jobs is a VIEW over the internal table — delete there.
    await db.execute(sql`delete from graphile_worker._private_jobs`);
  });

  it("enqueues escalate_find in the same transaction as the find insert", async () => {
    const [p] = await db.insert(partner).values({ name: "Acme", billingEmail: "ops@acme.test" }).returning();
    const [b] = await db.insert(tagBatch).values({ partnerId: p!.id, size: 1 }).returning();
    await db.insert(tag).values({ code: "ENQ1", partnerId: p!.id, batchId: b!.id, state: "registered" });

    const res = await app.request("/api/public/tag/ENQ1/find", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ location: { kind: "gps", lat: 19.43, lon: -99.13 } }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { findId: string };

    const jobs = await db.execute(
      sql`select t.identifier as task_identifier, j.payload
          from graphile_worker._private_jobs j
          join graphile_worker._private_tasks t on t.id = j.task_id
          where t.identifier = 'escalate_find'`,
    );
    expect(jobs.length).toBe(1);
    const payload = jobs[0]!["payload"] as { findId: string; step: number };
    expect(payload).toEqual({ findId: body.findId, step: 0 });
  });

  it("rolls back the find when enqueue fails (S1-1)", async () => {
    const [p] = await db.insert(partner).values({ name: "Acme", billingEmail: "ops@acme.test" }).returning();
    const [b] = await db.insert(tagBatch).values({ partnerId: p!.id, size: 1 }).returning();
    await db.insert(tag).values({ code: "ENQ2", partnerId: p!.id, batchId: b!.id, state: "registered" });

    const { publicTagRouter } = await import("../src/routes/public-tag.js");
    const { Hono } = await import("hono");
    const sub = new Hono().route(
      "/t",
      publicTagRouter({
        db,
        fingerprintSalt: "test_pepper_at_least_32_chars_long_xx",
        enqueue: () => Promise.reject(new Error("boom")),
      }),
    );

    const res = await sub.request("/t/ENQ2/find", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ location: { kind: "gps", lat: 19.43, lon: -99.13 } }),
    });
    expect(res.status).toBe(500);

    const rows = await db.select({ id: find.id }).from(find).where(eq(find.tagId, (await db.select({ id: tag.id }).from(tag).where(eq(tag.code, "ENQ2")))[0]!.id));
    expect(rows.length).toBe(0);
  });
});
