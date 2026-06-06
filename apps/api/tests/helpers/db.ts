import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { auditEvent, partner, partnerApiKey, tag, tagBatch } from "../../src/db/schema.js";

/**
 * Clear all partner-side rows in FK-safe order. Use in beforeEach for any
 * test that touches partner or its dependents.
 */
export async function resetPartnerTables(db: PostgresJsDatabase<Record<string, never>>) {
  await db.delete(auditEvent);
  await db.delete(tag);
  await db.delete(tagBatch);
  await db.delete(partnerApiKey);
  await db.delete(partner);
}
