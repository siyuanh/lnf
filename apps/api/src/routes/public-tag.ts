import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { FindSubmitRequest } from "@app/schemas";
import type { Db } from "../db/client.js";
import { find, tag } from "../db/schema.js";
import { logAuditEvent } from "../audit/log.js";

export interface PublicTagRouterOpts {
  db: Db;
  // Server-side salt mixed into the finder fingerprint hash so a leaked
  // fingerprint can't be reversed to an IP via rainbow tables. Reuses the
  // partner API key pepper for simplicity.
  fingerprintSalt: string;
}

// Pull a stable "who is this finder" signal from request headers. Forwarded
// IP wins when present (Cloud Run / reverse proxies); falls back to nothing
// rather than the loopback address from app.request() so tests are stable.
function clientFingerprint(c: Context, salt: string): string | null {
  const fwd = c.req.header("x-forwarded-for");
  const ip = fwd ? fwd.split(",")[0]!.trim() : null;
  if (!ip) return null;
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
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
      .select({
        state: tag.state,
        personName: tag.personName,
        personDetails: tag.personDetails,
      })
      .from(tag)
      .where(eq(tag.code, code))
      .limit(1);
    if (rows.length === 0) return c.json({ error: "not_found" }, 404);
    const row = rows[0]!;
    // Only surface the person's details to finders on a registered tag —
    // that's the reunite path. Never leak them for inactive/active/deprecated.
    if (row.state === "registered") {
      return c.json({
        state: row.state,
        personName: row.personName,
        personDetails: row.personDetails,
      });
    }
    return c.json({ state: row.state });
  });

  // Submit a find report (§5.4). Unauthenticated by design — anyone with the
  // QR can post. We only accept submissions against `registered` tags: a tag
  // that's still `inactive`/`active` has no caregiver to notify, and
  // `deprecated` is retired. Returns 404 in those cases without leaking which
  // state it's in.
  r.post("/:code/find", zValidator("json", FindSubmitRequest), async (c) => {
    const code = c.req.param("code");
    const input = c.req.valid("json");

    const rows = await opts.db
      .select({ id: tag.id, state: tag.state, partnerId: tag.partnerId })
      .from(tag)
      .where(eq(tag.code, code))
      .limit(1);
    if (rows.length === 0) return c.json({ error: "not_found" }, 404);
    const t = rows[0]!;
    if (t.state !== "registered") {
      return c.json({ error: "tag_not_active", state: t.state }, 409);
    }

    const fingerprint = clientFingerprint(c, opts.fingerprintSalt);

    const inserted = await opts.db.transaction(async (tx) => {
      const findRows = await tx
        .insert(find)
        .values({
          tagId: t.id,
          locationKind: input.location.kind,
          lat: input.location.kind === "gps" ? String(input.location.lat) : null,
          lon: input.location.kind === "gps" ? String(input.location.lon) : null,
          accuracyM:
            input.location.kind === "gps" && input.location.accuracyM !== undefined
              ? Math.round(input.location.accuracyM)
              : null,
          addressText: input.location.kind === "address" ? input.location.text : null,
          finderMessage: input.message ?? null,
          finderContact: input.contact ?? null,
          finderFingerprint: fingerprint,
        })
        .returning({ id: find.id });
      const f = findRows[0]!;
      await logAuditEvent(tx, {
        kind: "find.created",
        partnerId: t.partnerId,
        findId: f.id,
        payload: { v: 1, findId: f.id, tagCode: code, locationKind: input.location.kind },
      });
      return f;
    });

    return c.json({ findId: inserted.id });
  });

  return r;
}
