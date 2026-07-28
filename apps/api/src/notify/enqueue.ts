import { sql } from "drizzle-orm";
import type { DbExecutor } from "../db/client.js";

export interface EnqueueOptions {
  runAt?: Date; // defaults to now() in DB time (spec §4.3 #28)
}

/**
 * Enqueue a graphile-worker job inside an existing Drizzle transaction (S1-1).
 * Uses the worker schema's add_job() SQL function so the job commits or rolls
 * back with the surrounding business writes — no out-of-band pool.
 */
export async function enqueueJob(
  tx: DbExecutor,
  taskIdentifier: string,
  payload: Record<string, unknown>,
  opts: EnqueueOptions = {},
): Promise<void> {
  await tx.execute(
    sql`select graphile_worker.add_job(
      identifier => ${taskIdentifier},
      payload => ${JSON.stringify(payload)}::json,
      run_at => coalesce(${opts.runAt ?? null}::timestamptz, now())
    )`,
  );
}
