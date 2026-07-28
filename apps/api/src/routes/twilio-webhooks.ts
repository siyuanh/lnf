import { Hono } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { find, notificationAttempt } from "../db/schema.js";
import { logAuditEvent } from "../audit/log.js";
import { verifyAckAttempt } from "../notify/ack-token.js";

export interface TwilioWebhookRouterOpts {
  db: Db;
  ackSecret: string;
}

const twiml = (inner: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;

/**
 * Twilio <Gather> callback for voice acknowledgement (§4.3 #21, #24). Token is
 * the same per-attempt HMAC as email/SMS acks, carried on the callback URL.
 * Voice acks don't consume ack_link_used_at — the channel has no shareable
 * link (§3.5) — so we only require the row to exist and be unconsumed.
 *
 * Twilio signature validation (X-Twilio-Signature) is intentionally deferred:
 * the webhook only acknowledges, the token is unguessable, and §5.4 already
 * excludes real-provider integration. Track with the production hardening pass.
 */
export function twilioWebhookRouter(opts: TwilioWebhookRouterOpts) {
  const r = new Hono();

  r.post("/voice-ack", async (c) => {
    const attemptId = c.req.query("attempt") ?? "";
    const token = c.req.query("token") ?? "";
    const tries = Number(c.req.query("tries") ?? "1");
    if (verifyAckAttempt(token, opts.ackSecret) !== attemptId) {
      return c.text("unauthorized", 401);
    }

    const rows = await opts.db
      .select({ findId: notificationAttempt.findId, usedAt: notificationAttempt.ackLinkUsedAt })
      .from(notificationAttempt)
      .where(and(eq(notificationAttempt.id, attemptId), eq(notificationAttempt.channelKind, "voice")))
      .limit(1);
    if (rows.length === 0) return c.text("not found", 404);

    const form = await c.req.parseBody();
    const digits = typeof form["Digits"] === "string" ? form["Digits"] : "";

    if (digits === "1" && rows[0]!.usedAt === null) {
      const findId = rows[0]!.findId;
      await opts.db.transaction(async (tx) => {
        await tx
          .update(notificationAttempt)
          .set({ ackLinkUsedAt: new Date() })
          .where(and(eq(notificationAttempt.id, attemptId), isNull(notificationAttempt.ackLinkUsedAt)));
        await tx
          .update(find)
          .set({ status: "acknowledged", acknowledgedAt: new Date() })
          .where(and(eq(find.id, findId), eq(find.status, "reported")));
        await logAuditEvent(tx, {
          kind: "find.acknowledged",
          findId,
          payload: { v: 1, findId, channelKind: "voice", attemptId },
        });
      });
      return c.text(twiml(`<Say language="es-MX">Confirmamos que recibiste la alerta. Gracias.</Say>`), {
        headers: { "content-type": "text/xml" },
      });
    }

    if (tries >= 3) {
      return c.text(twiml(`<Say language="es-MX">No recibimos confirmación. Revisa la app LNF.</Say>`), {
        headers: { "content-type": "text/xml" },
      });
    }
    const retryUrl = `${c.req.url.split("?")[0]}?attempt=${attemptId}&tries=${tries + 1}&token=${encodeURIComponent(token)}`;
    return c.text(
      twiml(`<Gather numDigits="1" action="${retryUrl}" method="POST"><Say language="es-MX">Alerta LNF. Presiona 1 para confirmar que recibiste esta alerta.</Say></Gather>`),
      { headers: { "content-type": "text/xml" } },
    );
  });

  return r;
}
