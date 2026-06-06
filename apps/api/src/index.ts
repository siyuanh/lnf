import { Hono } from "hono";
import { loadEnv } from "./env.js";
import { makeDb } from "./db/client.js";
import { partnerRouter } from "./routes/partner.js";

const env = loadEnv();
const db = makeDb(env);

export const app = new Hono()
  .get("/healthz", (c) => c.json({ ok: true }))
  .route("/partner", partnerRouter({ db, pepper: env.PARTNER_API_KEY_PEPPER }));

export type AppType = typeof app;
