import { sql } from "drizzle-orm";
import type { DbExecutor } from "../db/client.js";
import { spendLedger } from "../db/schema.js";

/** Today's spend for a caregiver+kind in minor units (DB-time day). */
export async function spendToday(db: DbExecutor, caregiverId: string, kind: "sms" | "voice"): Promise<number> {
  const rows = await db.execute(
    sql`select coalesce(sum(cost_minor_units), 0)::int as total from spend_ledger
        where caregiver_id = ${caregiverId} and kind = ${kind} and day = current_date::text`,
  );
  return (rows[0]?.["total"] as number) ?? 0;
}

/** Record cost against today's ledger row (upsert). */
export async function recordSpend(db: DbExecutor, caregiverId: string, kind: "sms" | "voice", cost: number, countryCode?: string): Promise<void> {
  if (cost <= 0) return;
  await db
    .insert(spendLedger)
    .values({ caregiverId, day: new Date().toISOString().slice(0, 10), kind, costMinorUnits: cost, countryCode })
    .onConflictDoUpdate({
      target: [spendLedger.caregiverId, spendLedger.day, spendLedger.kind],
      set: { costMinorUnits: sql`${spendLedger.costMinorUnits} + ${cost}` },
    });
}
