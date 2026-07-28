import { run, type Runner, type TaskList } from "graphile-worker";
import type { Env } from "../env.js";
import type { EscalationDeps } from "./escalate-find.js";
import { makeEscalateFindTask } from "./escalate-find.js";

export interface WorkerTasks {
  escalateFind?: EscalationDeps; // optional until Task 9 lands
}

export async function startWorker(
  env: Pick<Env, "DATABASE_URL">,
  tasks: WorkerTasks = {},
): Promise<Runner> {
  const taskList: TaskList = {};
  if (tasks.escalateFind) taskList["escalate_find"] = makeEscalateFindTask(tasks.escalateFind);
  return run({
    connectionString: env.DATABASE_URL,
    concurrency: 4,
    pollInterval: 1000,
    taskList,
  });
}
