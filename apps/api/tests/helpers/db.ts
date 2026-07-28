import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  account,
  auditEvent,
  caregiver,
  caregiverContact,
  find,
  notificationAttempt,
  notificationChannel,
  partner,
  partnerApiKey,
  partnerUser,
  protectedPerson,
  session,
  spendLedger,
  tag,
  tagBatch,
  user,
  verification,
} from "../../src/db/schema.js";

/**
 * Clear all partner-side rows in FK-safe order. Use in beforeEach for any
 * test that touches partner or its dependents.
 */
export async function resetPartnerTables(db: PostgresJsDatabase<Record<string, never>>) {
  await db.delete(auditEvent);
  // notificationAttempt FKs to find; clear before find or the delete fails.
  await db.delete(notificationAttempt);
  // find FKs to tag; must be cleared before tag or the delete fails.
  await db.delete(find);
  await db.delete(tag);
  await db.delete(tagBatch);
  await db.delete(partnerApiKey);
  await db.delete(partnerUser);
  await db.delete(partner);
}

/**
 * Clear all caregiver-side rows + Better-Auth tables. Tag rows are also
 * cleared because tag.caregiver_id / tag.protected_person_id FK back here.
 */
export async function resetCaregiverTables(db: PostgresJsDatabase<Record<string, never>>) {
  await db.delete(auditEvent);
  // New notification tables FK to find/caregiver; clear before their parents.
  await db.delete(notificationAttempt);
  await db.delete(notificationChannel);
  await db.delete(spendLedger);
  await db.delete(find);
  await db.delete(tag);
  await db.delete(tagBatch);
  await db.delete(partnerApiKey);
  await db.delete(partnerUser);
  await db.delete(partner);
  await db.delete(caregiverContact);
  await db.delete(protectedPerson);
  await db.delete(caregiver);
  await db.delete(session);
  await db.delete(account);
  await db.delete(verification);
  await db.delete(user);
}

/**
 * Clear find table + all its FK dependencies in safe order.
 */
export async function resetFindTables(db: PostgresJsDatabase<Record<string, never>>) {
  await db.delete(auditEvent);
  await db.delete(notificationAttempt);
  await db.delete(find);
  await db.delete(tag);
  await db.delete(tagBatch);
  await db.delete(partnerApiKey);
  await db.delete(partner);
}
