import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Db } from "../db/client.js";
import * as schema from "../db/schema.js";

export interface AuthOpts {
  db: Db;
  secret: string;
  baseUrl: string;
  cookieDomain?: string;
  // Sliding inactivity window in seconds. Both the cookie max-age and the
  // session DB row expire after this; any request within the window extends
  // both. Defaults to 15 minutes for the partner portal.
  sessionMaxAgeSec?: number;
}

export function makeAuth(opts: AuthOpts) {
  const sessionMaxAge = opts.sessionMaxAgeSec ?? 60 * 15;
  return betterAuth({
    database: drizzleAdapter(opts.db, {
      provider: "pg",
      schema: {
        user: schema.user,
        account: schema.account,
        session: schema.session,
        verification: schema.verification,
      },
    }),
    secret: opts.secret,
    baseURL: opts.baseUrl,
    emailAndPassword: { enabled: true, autoSignIn: true },
    session: { expiresIn: sessionMaxAge, updateAge: sessionMaxAge },
    advanced: opts.cookieDomain
      ? {
          crossSubDomainCookies: { enabled: true, domain: opts.cookieDomain },
          defaultCookieAttributes: { sameSite: "none", secure: true },
        }
      : undefined,
  });
}

export type Auth = ReturnType<typeof makeAuth>;
