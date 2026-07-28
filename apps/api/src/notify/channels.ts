import { and, asc, eq, isNull } from "drizzle-orm";
import type { DbExecutor } from "../db/client.js";
import { notificationChannel } from "../db/schema.js";

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
