import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { tag } from "../db/schema.js";
import { logAuditEvent } from "../audit/log.js";

export interface PublicTagRouterOpts {
  db: Db;
}

// Public, unauthenticated lookup used by the finder page (/f/<code>).
// First successful read of an inactive tag flips it to active — this is the
// "manufacturer scanned the printed tag" signal. Subsequent reads just return
// the current state. Anyone can call this; that's fine, the only side effect
// is a one-time inactive→active transition.
export function publicTagRouter(opts: PublicTagRouterOpts) {
  const r = new Hono();

  r.get("/:code", async (c) => {
    const code = c.req.param("code");
    // Atomic CAS: only the row that's still 'inactive' becomes 'active'. The
    // returning() lets us tell whether *this* request did the flip vs found
    // the tag already past inactive.
    const flipped = await opts.db
      .update(tag)
      .set({ state: "active", activatedAt: new Date() })
      .where(and(eq(tag.code, code), eq(tag.state, "inactive")))
      .returning({ partnerId: tag.partnerId });

    if (flipped.length > 0) {
      await opts.db.transaction(async (tx) => {
        await logAuditEvent(tx, {
          kind: "tag.activated",
          partnerId: flipped[0]!.partnerId,
          payload: { v: 1, code },
        });
      });
      return c.json({ state: "active" as const });
    }

    const rows = await opts.db
      .select({ state: tag.state })
      .from(tag)
      .where(eq(tag.code, code))
      .limit(1);
    if (rows.length === 0) return c.json({ error: "not_found" }, 404);
    return c.json({ state: rows[0]!.state });
  });

  return r;
}
