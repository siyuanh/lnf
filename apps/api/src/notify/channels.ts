import { and, asc, eq, isNull } from "drizzle-orm";
import type { DbExecutor } from "../db/client.js";
import { caregiverContact, notificationChannel } from "../db/schema.js";

/**
 * Escalation chain for a caregiver (account defaults only in v1 — per-person
 * overrides are schema-ready, UI in a later plan). Ordered by priority.
 */
export async function loadChannels(db: DbExecutor, caregiverId: string) {
  return db
    .select()
    .from(notificationChannel)
    .where(
      and(
        eq(notificationChannel.caregiverId, caregiverId),
        isNull(notificationChannel.protectedPersonId),
        eq(notificationChannel.isActive, true),
      ),
    )
    .orderBy(asc(notificationChannel.priority));
}

/**
 * Derive default escalation channels for a caregiver who just paired their
 * first tag: account email first, then sms/voice on their first phone contact.
 * Idempotent — no-ops when defaults already exist. Push rows are added later
 * by the mobile plan when a device registers.
 */
export async function ensureDefaultChannels(db: DbExecutor, caregiverId: string, accountEmail: string): Promise<void> {
  const existing = await loadChannels(db, caregiverId);
  if (existing.length > 0) return;
  await db.insert(notificationChannel).values({
    caregiverId, kind: "email", target: accountEmail, priority: 0, escalationDelaySeconds: 300,
  });
  const phones = await db
    .select({ value: caregiverContact.value })
    .from(caregiverContact)
    .where(and(eq(caregiverContact.caregiverId, caregiverId), isNull(caregiverContact.deletedAt)))
    .limit(1);
  if (phones[0]) {
    await db.insert(notificationChannel).values([
      { caregiverId, kind: "sms" as const, target: phones[0]!.value, priority: 1, escalationDelaySeconds: 300 },
      { caregiverId, kind: "voice" as const, target: phones[0]!.value, priority: 2, escalationDelaySeconds: 0 },
    ]);
  }
}
