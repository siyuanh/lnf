import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Db } from "../db/client.js";
import * as schema from "../db/schema.js";

export interface AuthOpts {
  db: Db;
  secret: string;
  baseUrl: string;
}

export function makeAuth(opts: AuthOpts) {
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
    session: { expiresIn: 60 * 60 * 24 * 30 },
  });
}

export type Auth = ReturnType<typeof makeAuth>;
