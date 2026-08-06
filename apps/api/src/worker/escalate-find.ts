import { and, eq, isNull } from "drizzle-orm";
import type { Task } from "graphile-worker";
import type { Env } from "../env.js";
import type { Db, DbExecutor } from "../db/client.js";
import { makeDb } from "../db/client.js";
import { auditEvent, find, notificationAttempt, protectedPerson, tag } from "../db/schema.js";
import { enqueueJob } from "../notify/enqueue.js";
import { loadChannels } from "../notify/channels.js";
import { recordSpend, spendToday } from "../notify/spend.js";
import { signAckAttempt } from "../notify/ack-token.js";
import { renderAlert } from "../notify/templates.js";
import { makeRegistry } from "../notify/registry.js";
import type { SenderRegistry } from "../notify/senders.js";
import type { ChannelKind } from "@app/schemas";

export interface EscalationDeps {
  db: Db;
  senders: SenderRegistry;
  ackSecret: string;
  publicBaseUrl: string;
  spendCapDailyMinor: number;
  /** Injectable for tests — defaults to the tx-safe SQL enqueue. */
  enqueue?: typeof enqueueJob;
}

export function makeEscalationDeps(env: Env): EscalationDeps {
  return {
    db: makeDb(env),
    senders: makeRegistry(env),
    ackSecret: env.ACK_LINK_SECRET,
    publicBaseUrl: env.PUBLIC_BASE_URL,
    spendCapDailyMinor: env.SPEND_CAP_DAILY_MINOR,
  };
}

const PAID_KINDS = new Set<ChannelKind>(["sms", "voice"]);

export function makeEscalateFindTask(deps: EscalationDeps): Task {
  const enqueue = deps.enqueue ?? enqueueJob;
  return async (payload) => {
    const { findId, step } = payload as { findId: string; step: number };

    // Idempotency: re-read status every invocation (§3.5). Ack between steps
    // turns this job into a no-op.
    const f = await deps.db
      .select({ status: find.status, tagId: find.tagId, addressText: find.addressText })
      .from(find)
      .where(eq(find.id, findId))
      .limit(1);
    if (f.length === 0 || f[0]!.status !== "reported") return;

    const t = await deps.db
      .select({
        caregiverId: tag.caregiverId,
        personName: tag.personName,
        label: tag.label,
        personFullName: protectedPerson.fullName,
        personNickname: protectedPerson.nickname,
      })
      .from(tag)
      .leftJoin(
        protectedPerson,
        and(eq(protectedPerson.id, tag.protectedPersonId), isNull(protectedPerson.deletedAt)),
      )
      .where(eq(tag.id, f[0]!.tagId))
      .limit(1);
    const caregiverId = t[0]?.caregiverId;
    if (!caregiverId) return; // tag orphaned of caregiver — nothing to alert

    const channels = await loadChannels(deps.db, caregiverId);
    const channel = channels[step];
    if (!channel) {
      // Chain exhausted: terminal expired (§3.5 stop conditions). CAS on
      // status='reported' — a resolve/ack racing this invocation must not be
      // overwritten, and only a transitioned row earns the audit event.
      await deps.db.transaction(async (tx) => {
        const transitioned = await tx
          .update(find)
          .set({ status: "expired", expiredAt: new Date() })
          .where(and(eq(find.id, findId), eq(find.status, "reported")))
          .returning({ id: find.id });
        if (transitioned.length === 0) return;
        const attempts = await tx
          .select({ id: notificationAttempt.id })
          .from(notificationAttempt)
          .where(eq(notificationAttempt.findId, findId));
        await tx.insert(auditEvent).values({
          kind: "find.expired",
          caregiverId,
          findId,
          payload: { v: 1, findId, attemptsCount: attempts.length },
        });
      });
      return;
    }

    const kind = channel.kind;
    const next = async (tx: DbExecutor, delaySeconds: number) => {
      const runAt = delaySeconds > 0 ? new Date(Date.now() + delaySeconds * 1000) : undefined;
      await enqueue(tx, "escalate_find", { findId, step: step + 1 }, { runAt });
    };

    // Spend cap is checked just-in-time at dispatch (§3.5, §4.3 #20).
    if (PAID_KINDS.has(kind)) {
      const spent = await spendToday(deps.db, caregiverId, kind as "sms" | "voice");
      if (spent >= deps.spendCapDailyMinor) {
        await deps.db.transaction(async (tx) => {
          await tx.insert(notificationAttempt).values({
            findId, channelKind: kind, channelTarget: channel.target,
            deliveryStatus: "failed", failureReason: "spend_cap",
          });
          await next(tx, 0);
        });
        return;
      }
    }

    const sender = deps.senders[kind];
    if (!sender) {
      // Channel kind with no configured sender (push until mobile lands):
      // log and advance immediately, no delay.
      await deps.db.transaction(async (tx) => {
        await tx.insert(notificationAttempt).values({
          findId, channelKind: kind, channelTarget: channel.target,
          deliveryStatus: "failed", failureReason: "provider_not_configured",
        });
        await next(tx, 0);
      });
      return;
    }

    const personLabel =
      t[0]!.personName ?? t[0]!.personFullName ?? t[0]!.personNickname ?? t[0]!.label ?? "tu familiar";
    const locationText = f[0]!.addressText ?? "ubicación GPS compartida";

    // Reserve the attempt row first so its id can be signed into the ack link.
    const [attempt] = await deps.db
      .insert(notificationAttempt)
      .values({
        findId,
        channelKind: kind,
        channelTarget: channel.target,
        deliveryStatus: "queued",
        ...(kind === "email" || kind === "sms"
          ? { ackLinkExpiresAt: new Date(Date.now() + 24 * 3600 * 1000) }
          : {}),
      })
      .returning({ id: notificationAttempt.id });

    const ackUrl = `${deps.publicBaseUrl}/api/public/ack/${attempt!.id}?token=${signAckAttempt(attempt!.id, deps.ackSecret)}`;
    const voiceAckCallbackUrl =
      kind === "voice"
        ? `${deps.publicBaseUrl}/api/webhooks/twilio/voice-ack?attempt=${attempt!.id}&token=${signAckAttempt(attempt!.id, deps.ackSecret)}`
        : undefined;
    const rendered = renderAlert("es", { personLabel, locationText, ackUrl });
    const result = await sender.send({
      kind,
      target: channel.target,
      subject: rendered.subject,
      text: rendered.text,
      locale: "es",
      voiceAckCallbackUrl,
    });

    await deps.db.transaction(async (tx) => {
      await tx
        .update(notificationAttempt)
        .set({
          deliveryStatus: result.ok ? "sent" : "failed",
          providerMessageId: result.providerMessageId ?? null,
          failureReason: result.ok ? null : (result.failureReason ?? "provider_error"),
          costMinorUnits: result.costMinorUnits ?? 0,
        })
        .where(eq(notificationAttempt.id, attempt!.id));
      if (result.ok && PAID_KINDS.has(kind)) {
        await recordSpend(tx, caregiverId, kind as "sms" | "voice", result.costMinorUnits ?? 0);
      }
      // Provider 5xx → advance immediately, no retry (§4.3 #19). Success →
      // wait this channel's configured delay before the next one (§3.5).
      await next(tx, result.ok ? channel.escalationDelaySeconds : 0);
    });
  };
}
