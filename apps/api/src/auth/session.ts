import { eq, isNull, and } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import type { Db } from "../db/client.js";
import type { Auth } from "./better-auth.js";
import { partnerUser } from "../db/schema.js";

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
    const member = rows[0];
    if (!member) return forbidden(c);
    c.set("partnerId", member.partnerId);
    c.set("partnerUserId", member.id);
    await next();
  };
}

function unauthorized(c: Context) {
  return c.json({ error: "unauthorized" }, 401);
}
function forbidden(c: Context) {
  return c.json({ error: "forbidden" }, 403);
}
