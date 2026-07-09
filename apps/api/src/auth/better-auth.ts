import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";
import type { Db } from "../db/client.js";
import * as schema from "../db/schema.js";

export interface AuthOpts {
  db: Db;
  secret: string;
  baseUrl: string;
  cookieDomain?: string;
  // Extra origins Better-Auth should accept on cookie-bearing requests (its
  // CSRF origin check). baseUrl is always trusted; add others here when the
  // service answers on more than one hostname — e.g. Cloud Run exposes both a
  // project-number URL and a hash URL for the same service.
  trustedOrigins?: string[];
  // Sliding inactivity window in seconds. Both the cookie max-age and the
  // session DB row expire after this; any request within the window extends
  // both. Defaults to 15 minutes for the partner portal.
  sessionMaxAgeSec?: number;
  // Called when Better-Auth wants to send a verification email. Left as an
  // injected callback because there's no email provider wired yet — dev logs
  // to stdout; production will hand in a Resend/SES/etc sender. Missing hook
  // means we don't even ask Better-Auth to generate the link.
  sendVerificationEmail?: (payload: {
    to: string;
    verificationUrl: string;
  }) => Promise<void> | void;
}

export function makeAuth(opts: AuthOpts) {
  const sessionMaxAge = opts.sessionMaxAgeSec ?? 60 * 15;
  const sendVerificationEmail =
    opts.sendVerificationEmail ??
    (({ to, verificationUrl }: { to: string; verificationUrl: string }) => {
      // Dev/test default: no email provider wired. Stdout instead of throwing so
      // signup still succeeds locally — real sender goes in via opts.
      console.log(`[dev-email] verification for ${to}: ${verificationUrl}`);
    });
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
    // baseURL is trusted implicitly; merge any extra hostnames the service
    // also answers on so a cookie set under one origin isn't rejected under
    // another. De-duped to keep the list clean.
    trustedOrigins: Array.from(new Set([opts.baseUrl, ...(opts.trustedOrigins ?? [])])),
    // requireEmailVerification stays off: we don't want signup to hard-block
    // on an unclicked link (there's no mail provider wired). The verification
    // link is sent on signup so real deployments can flip this true later
    // without a schema change.
    emailAndPassword: { enabled: true, autoSignIn: true, requireEmailVerification: false },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendVerificationEmail({ to: user.email, verificationUrl: url });
      },
    },
    user: {
      // `phone` on the caregiver user is optional metadata for now — no
      // uniqueness, no verification. Wired here so signUp.email(...) accepts
      // it in one round trip; strict validation lives in the shared Zod.
      additionalFields: {
        phone: { type: "string", required: false, input: true },
      },
    },
    session: { expiresIn: sessionMaxAge, updateAge: sessionMaxAge },
    // bearer(): lets non-cookie clients (the Expo mobile app) authenticate by
    // sending `Authorization: Bearer <token>`, where <token> is the session
    // token Better-Auth returns on sign-in/sign-up. Additive — web keeps using
    // cookies; getSession() accepts either. Settles the mobile-vs-web auth
    // shape in one place per the CLAUDE.md gotcha.
    plugins: [bearer()],
    advanced: opts.cookieDomain
      ? {
          crossSubDomainCookies: { enabled: true, domain: opts.cookieDomain },
          defaultCookieAttributes: { sameSite: "none", secure: true },
        }
      : undefined,
  });
}

export type Auth = ReturnType<typeof makeAuth>;
