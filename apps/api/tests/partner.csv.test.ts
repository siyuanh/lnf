import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { partner, partnerApiKey } from "../src/db/schema.js";
import { hashApiKey, mintApiKey } from "../src/auth/api-key.js";
import { resetPartnerTables } from "./helpers/db.js";

describe("GET /partner-api/batches/:id/codes.csv", () => {
  const pepper = "test_pepper_at_least_32_chars_long_xx";
  process.env.PARTNER_API_KEY_PEPPER = pepper;
  process.env.BETTER_AUTH_SECRET = "test_secret_at_least_32_chars_long_xxx";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";

  const db = drizzle(postgres(process.env.DATABASE_URL!));
  let presented: string;
  let app: typeof import("../src/index.js")["app"];

  async function mintBatch(size: number) {
    const res = await app.request("/partner-api/batches", {
      method: "POST",
      body: JSON.stringify({ size }),
      headers: { "content-type": "application/json", authorization: `Bearer ${presented}` },
    });
    return res.json() as Promise<{ batchId: string; downloadUrl: string }>;
  }

  beforeEach(async () => {
    if (!app) {
      app = (await import("../src/index.js")).app;
    }
    await resetPartnerTables(db);
    const [p] = await db.insert(partner).values({ name: "Acme", billingEmail: "ops@acme.test" }).returning();
    const minted = mintApiKey();
    presented = minted.presented;
    await db.insert(partnerApiKey).values({
      partnerId: p!.id,
      keyPrefix: minted.prefix,
      keyHash: hashApiKey(minted.secret, pepper),
      label: "ci",
    });
  });

  it("downloads a CSV of the codes once", async () => {
    const { downloadUrl } = await mintBatch(5);
    const res = await app.request(downloadUrl, {
      headers: { authorization: `Bearer ${presented}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const body = await res.text();
    const lines = body.trim().split("\n");
    expect(lines).toHaveLength(5);
    for (const line of lines) expect(line).toMatch(/^[0-9A-HJKMNP-TV-Z]{22}$/);
  });

  it("refuses a second download with the same token", async () => {
    const { downloadUrl } = await mintBatch(3);
    const ok = await app.request(downloadUrl, { headers: { authorization: `Bearer ${presented}` } });
    expect(ok.status).toBe(200);
    await ok.text();
    const again = await app.request(downloadUrl, { headers: { authorization: `Bearer ${presented}` } });
    expect(again.status).toBe(410);
  });

  it("refuses a forged token (constant-time compare)", async () => {
    const { batchId } = await mintBatch(3);
    const res = await app.request(
      `/partner-api/batches/${batchId}/codes.csv?token=${batchId}.totally-wrong-secret-here-please-die`,
      { headers: { authorization: `Bearer ${presented}` } },
    );
    expect(res.status).toBe(401);
  });
});
