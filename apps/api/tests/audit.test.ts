import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { logAuditEvent } from "../src/audit/log.js";
import { auditEvent } from "../src/db/schema.js";
import { resetPartnerTables } from "./helpers/db.js";

describe("logAuditEvent", () => {
  const db = drizzle(postgres(process.env.DATABASE_URL!));

  beforeEach(async () => {
    await resetPartnerTables(db);
  });

  it("writes a versioned payload row", async () => {
    const partnerId = "11111111-1111-1111-1111-111111111111";
    const batchId = "22222222-2222-2222-2222-222222222222";
    await logAuditEvent(db, {
      kind: "partner.batch.minted",
      partnerId,
      payload: { v: 1, batchId, partnerId, size: 100, label: null },
    });
    const rows = await db.select().from(auditEvent).where(eq(auditEvent.kind, "partner.batch.minted"));
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!.payload)).toMatchObject({ v: 1, batchId, size: 100 });
  });
});
