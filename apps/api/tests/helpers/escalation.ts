import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { makeEscalateFindTask, type EscalationDeps } from "../../src/worker/escalate-find.js";

export interface ScheduledJob {
  payload: { findId: string; step: number };
  runAt?: Date;
}

/** Run one escalate_find step with an in-memory job recorder instead of the real queue. */
export function makeHarness(deps: Omit<EscalationDeps, "enqueue">) {
  const scheduled: ScheduledJob[] = [];
  const task = makeEscalateFindTask({
    ...deps,
    enqueue: async (_db, task, payload, opts) => {
      if (task !== "escalate_find") throw new Error("unexpected task " + task);
      scheduled.push({ payload: payload as { findId: string; step: number }, runAt: opts?.runAt });
    },
  });
  return {
    scheduled,
    run: (findId: string, step: number) =>
      task({ findId, step }, { job: { id: 1 }, withPgClient: null } as never),
  };
}

export async function jobPayloads(db: PostgresJsDatabase<Record<string, never>>) {
  const rows = await db.execute(
    sql`select j.payload
        from graphile_worker._private_jobs j
        join graphile_worker._private_tasks t on t.id = j.task_id
        where t.identifier = 'escalate_find' order by j.created_at`,
  );
  return rows.map((r) => r["payload"] as { findId: string; step: number });
}
