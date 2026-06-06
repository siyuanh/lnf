import { run, type Runner } from "graphile-worker";
import type { Env } from "../env.js";

export async function startWorker(env: Pick<Env, "DATABASE_URL">): Promise<Runner> {
  return run({
    connectionString: env.DATABASE_URL,
    concurrency: 4,
    pollInterval: 1000,
    taskList: {
      // Jobs are registered in later phases. Empty list is valid.
    },
  });
}
