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
    // DB-time day on the write path too — spendToday() reads by current_date,
    // and JS-UTC vs DB-day skew would let the cap check miss spend around
    // midnight.
    .values({ caregiverId, day: sql`current_date::text`, kind, costMinorUnits: cost, countryCode })
    .onConflictDoUpdate({
      target: [spendLedger.caregiverId, spendLedger.day, spendLedger.kind],
      set: { costMinorUnits: sql`${spendLedger.costMinorUnits} + ${cost}` },
    });
}
