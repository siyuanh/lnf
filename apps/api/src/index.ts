import { Hono } from "hono";
import { cors } from "hono/cors";
import { loadEnv } from "./env.js";
import { makeDb } from "./db/client.js";
import { partnerApiRouter, partnerSessionRouter } from "./routes/partner.js";
import { makeAuth } from "./auth/better-auth.js";

const env = loadEnv();
const db = makeDb(env);
const auth = makeAuth({ db, secret: env.BETTER_AUTH_SECRET, baseUrl: env.BETTER_AUTH_URL });

export const app = new Hono()
  .use(
    "*",
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true,
    }),
  )
  .get("/healthz", (c) => c.json({ ok: true }))
  .all("/api/auth/*", (c) => auth.handler(c.req.raw))
  .route("/partner-api", partnerApiRouter({ db, pepper: env.PARTNER_API_KEY_PEPPER }))
  .route("/partner", partnerSessionRouter({ db, pepper: env.PARTNER_API_KEY_PEPPER, auth }));

export type AppType = typeof app;
