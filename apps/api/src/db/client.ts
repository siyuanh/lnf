import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Env } from "../env.js";

/**
 * `DbExecutor` is the minimal interface for "anything you can issue queries against":
 * either a top-level Drizzle client or a transaction. Helpers that compose with
 * `db.transaction(async tx => ...)` should accept this, not `Db`.
 */
export type DbExecutor = PostgresJsDatabase<Record<string, never>>;

export type Db = ReturnType<typeof makeDb>;

export function makeDb(env: Pick<Env, "DATABASE_URL">) {
  const sql = postgres(env.DATABASE_URL, { max: 10 });
  return drizzle(sql);
}
