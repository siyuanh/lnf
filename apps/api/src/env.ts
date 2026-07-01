import { z } from "zod";

const PLACEHOLDER_PREFIX = "replace-with-";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  PARTNER_API_KEY_PEPPER: z.string().min(32),
  // Origin allowed to make credentialed requests against /api/auth/* and
  // /partner/*. Defaults to BETTER_AUTH_URL for the common case where the
  // portal and the auth callback share an origin; split when they diverge.
  WEB_ORIGIN: z.string().url().optional(),
  // Comma-separated extra origins to trust for Better-Auth's CSRF origin check,
  // beyond BETTER_AUTH_URL. Needed when the service answers on more than one
  // hostname — e.g. Cloud Run's project-number URL AND its hash URL both point
  // at the same service, and the browser may load either.
  AUTH_TRUSTED_ORIGINS: z.string().optional(),
  // Cookie domain for cross-subdomain Better-Auth sessions in prod, e.g.
  // ".example.com" so cookies set by api.example.com flow to app.example.com.
  // Leave unset for localhost dev (no cookie domain).
  COOKIE_DOMAIN: z.string().optional(),
  // Inactivity timeout for partner portal sessions, in seconds. Behaves as a
  // sliding window: any request within this many seconds of the last one
  // extends the session; otherwise the cookie expires and the portal kicks
  // back to /partner/login. Default 15 min.
  PARTNER_SESSION_MAX_AGE_SEC: z.coerce.number().int().positive().default(900),
});

export type Env = z.infer<typeof EnvSchema> & { WEB_ORIGIN: string };

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    console.error("Invalid environment:", result.error.flatten().fieldErrors);
    throw new Error("Invalid environment");
  }
  const env = result.data;

  // Refuse to start in production with .env.example placeholder values. These
  // satisfy the length/format constraints (e.g. "replace-with-32-byte-..." is
  // exactly 32 chars), so without this guard a forgotten dev secret would
  // silently ship.
  if (env.NODE_ENV === "production") {
    const placeholders: string[] = [];
    if (env.BETTER_AUTH_SECRET.startsWith(PLACEHOLDER_PREFIX)) placeholders.push("BETTER_AUTH_SECRET");
    if (env.PARTNER_API_KEY_PEPPER.startsWith(PLACEHOLDER_PREFIX)) placeholders.push("PARTNER_API_KEY_PEPPER");
    if (placeholders.length > 0) {
      throw new Error(`Refusing to start: placeholder values in production env: ${placeholders.join(", ")}`);
    }
  }

  return { ...env, WEB_ORIGIN: env.WEB_ORIGIN ?? env.BETTER_AUTH_URL };
}
