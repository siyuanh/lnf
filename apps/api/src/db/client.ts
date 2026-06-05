import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Env } from "../env.js";

export type Db = ReturnType<typeof makeDb>;

export function makeDb(env: Pick<Env, "DATABASE_URL">) {
  const sql = postgres(env.DATABASE_URL, { max: 10 });
  return drizzle(sql);
}
