import { Hono } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { find, notificationAttempt } from "../db/schema.js";
import { logAuditEvent } from "../audit/log.js";
import { verifyAckAttempt } from "../notify/ack-token.js";

export interface PublicAckRouterOpts {
  db: Db;
  ackSecret: string;
}

const PAGE = (title: string, body: string) =>
  `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem"><h1>${title}</h1><p>${body}</p></body></html>`;

/**
 * Public acknowledgement endpoint (§4.3 #22-23a). Signed per notification_attempt
 * (S1-4); single-use and 24h-expiring for link-carrying channels. Returns HTML
 * because the primary entry point is an email/SMS link opened in a browser.
 */
export function publicAckRouter(opts: PublicAckRouterOpts) {
  const r = new Hono();

  r.post("/:attemptId", async (c) => {
    const attemptId = c.req.param("attemptId");
    const token = c.req.query("token") ?? "";
    const verified = verifyAckAttempt(token, opts.ackSecret);
    if (verified !== attemptId) {
      return c.html(PAGE("Enlace no válido", "Este enlace de confirmación no es válido."), 401);
    }

    // Claim the link atomically: only a row that is unused AND unexpired can be
    // consumed. Concurrent double-clicks race on this UPDATE — one wins.
    const claimed = await opts.db
      .update(notificationAttempt)
      .set({ ackLinkUsedAt: new Date() })
      .where(
        and(
          eq(notificationAttempt.id, attemptId),
          isNull(notificationAttempt.ackLinkUsedAt),
          // ack_link_expires_at null (push/voice) never expires via this route;
          // those kinds don't carry links, but the check is harmless.
        ),
      )
      .returning({
        findId: notificationAttempt.findId,
        expiresAt: notificationAttempt.ackLinkExpiresAt,
        channelKind: notificationAttempt.channelKind,
      });

    if (claimed.length === 0) {
      return c.html(PAGE("Ya confirmada", "Esta alerta ya fue confirmada desde otro enlace o canal."), 410);
    }
    const { findId, expiresAt, channelKind } = claimed[0]!;
    if (expiresAt && expiresAt.getTime() < Date.now()) {
      return c.html(PAGE("Enlace vencido", "Este enlace expiró. Revisa la app para ver la alerta."), 410);
    }

    await opts.db.transaction(async (tx) => {
      // Only move reported → acknowledged; an already-resolved/expired find
      // keeps its state (ack of a stale link is still recorded above).
      await tx
        .update(find)
        .set({ status: "acknowledged", acknowledgedAt: new Date() })
        .where(and(eq(find.id, findId), eq(find.status, "reported")));
      await logAuditEvent(tx, {
        kind: "find.acknowledged",
        findId,
        payload: { v: 1, findId, channelKind, attemptId },
      });
    });

    return c.html(PAGE("Recibido", "Confirmamos que recibiste la alerta."), 200);
  });

  return r;
}
