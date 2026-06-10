import { eq } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import type { Db } from "../db/client.js";
import type { Auth } from "./better-auth.js";
import { caregiver } from "../db/schema.js";
import { logAuditEvent } from "../audit/log.js";

export interface CaregiverSessionMiddlewareOpts {
  db: Db;
  auth: Auth;
}

declare module "hono" {
  interface ContextVariableMap {
    caregiverId: string;
    caregiverUserId: string;
    caregiverEmail: string;
  }
}

// Find-or-create the caregiver row for the authenticated Better-Auth user.
// This way signup is a single Better-Auth call from the client; the caregiver
// row appears on the first authenticated hit. The first creation logs
// `caregiver.signup` with the new caregiver's id.
export function makeCaregiverSessionMiddleware(opts: CaregiverSessionMiddlewareOpts): MiddlewareHandler {
  return async (c, next) => {
    const session = await opts.auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return unauthorized(c);
    const userId = session.user.id;
    const existing = await opts.db
      .select({ id: caregiver.id })
      .from(caregiver)
      .where(eq(caregiver.userId, userId))
      .limit(1);
    let caregiverId = existing[0]?.id;
    if (!caregiverId) {
      const inserted = await opts.db
        .insert(caregiver)
        .values({ userId })
        .returning({ id: caregiver.id });
      caregiverId = inserted[0]!.id;
      await opts.db.transaction(async (tx) => {
        await logAuditEvent(tx, {
          kind: "caregiver.signup",
          caregiverId,
          payload: { v: 1, caregiverId, userId },
        });
      });
    }
    c.set("caregiverId", caregiverId);
    c.set("caregiverUserId", userId);
    c.set("caregiverEmail", session.user.email);
    await next();
  };
}

function unauthorized(c: Context) {
  return c.json({ error: "unauthorized" }, 401);
}
