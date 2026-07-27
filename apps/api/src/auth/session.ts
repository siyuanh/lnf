import { eq, isNull, and } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import type { Db } from "../db/client.js";
import type { Auth } from "./better-auth.js";
import { account, partner, partnerUser } from "../db/schema.js";
import { logAuditEvent } from "../audit/log.js";

export interface SessionMiddlewareOpts {
  db: Db;
  auth: Auth;
}

declare module "hono" {
  interface ContextVariableMap {
    partnerUserId: string;
  }
}

export function makePartnerSessionMiddleware(opts: SessionMiddlewareOpts): MiddlewareHandler {
  return async (c, next) => {
    const session = await opts.auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return unauthorized(c);
    const rows = await opts.db
      .select()
      .from(partnerUser)
      .where(and(eq(partnerUser.email, session.user.email), isNull(partnerUser.deletedAt)))
      .limit(1);
    let member = rows[0];
    if (!member) {
      // Partner accounts are normally admin-provisioned (see seed-partner.ts) —
      // an unrecognized email is rejected. Google sign-in is the one exception:
      // anyone who reaches the portal via Google gets a partner shell created
      // on first hit, mirroring the caregiver flow's find-or-create. Gate on an
      // actual linked google account (not just "any authenticated session") so
      // the admin-provisioned, password-only path keeps its strict behavior.
      const viaGoogle = await opts.db
        .select({ id: account.id })
        .from(account)
        .where(and(eq(account.userId, session.user.id), eq(account.providerId, "google")))
        .limit(1);
      if (viaGoogle.length === 0) return forbidden(c);
      member = await provisionPartnerForGoogleUser(opts.db, session.user.email, session.user.name ?? session.user.email);
    }
    c.set("partnerId", member.partnerId);
    c.set("partnerUserId", member.id);
    await next();
  };
}

async function provisionPartnerForGoogleUser(db: Db, email: string, name: string) {
  return db.transaction(async (tx) => {
    const [p] = await tx.insert(partner).values({ name, billingEmail: email }).returning();
    const [created] = await tx
      .insert(partnerUser)
      .values({ partnerId: p!.id, email, role: "admin" })
      .returning();
    await logAuditEvent(tx, {
      kind: "partner.signup",
      partnerId: p!.id,
      payload: { v: 1, partnerId: p!.id, partnerUserId: created!.id, email, via: "google" },
    });
    return created!;
  });
}

function unauthorized(c: Context) {
  return c.json({ error: "unauthorized" }, 401);
}
function forbidden(c: Context) {
  return c.json({ error: "forbidden" }, 403);
}
