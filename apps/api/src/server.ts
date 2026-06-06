import { serve } from "@hono/node-server";
import { app } from "./index.js";
import { loadEnv } from "./env.js";

loadEnv();
const port = 3001;
console.log(`api listening on :${port}`);
serve({ fetch: app.fetch, port });
