import type { Task } from "graphile-worker";
import type { Env } from "../env.js";

// Real implementation lands in Task 9. Stub lets the worker boot with the
// escalate_find task registered so enqueue tests exercise the real path.
export interface EscalationDeps {
  db: unknown;
}

export function makeEscalationDeps(env: Env): EscalationDeps {
  throw new Error("not implemented until Task 9");
}

export function makeEscalateFindTask(_deps: EscalationDeps): Task {
  return async () => {};
}
