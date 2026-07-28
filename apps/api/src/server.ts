import { serve } from "@hono/node-server";
import { app } from "./index.js";
import { loadEnv } from "./env.js";
import { startWorker } from "./worker/index.js";
import { makeEscalationDeps } from "./worker/escalate-find.js";

const env = loadEnv();
const port = 3001;

const runner = await startWorker(env, { escalateFind: makeEscalationDeps(env) });
console.log(`api listening on :${port} (worker running)`);
serve({ fetch: app.fetch, port });

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.once(sig, () => void runner.stop().then(() => process.exit(0)));
}
