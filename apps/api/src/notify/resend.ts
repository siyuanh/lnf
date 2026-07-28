import type { ChannelSender, NotificationMessage, SendResult } from "./senders.js";

// Thin fetch client for Resend (https://resend.com/docs/api-reference/emails/send-email).
// Real delivery is never exercised in tests (spec §5.4) — the fake covers behavior.
export function makeResendSender(apiKey: string, from: string): ChannelSender {
  return {
    name: "resend",
    kind: "email",
    async send(msg: NotificationMessage): Promise<SendResult> {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from, to: [msg.target], subject: msg.subject, text: msg.text }),
      });
      if (!res.ok) return { ok: false, failureReason: "provider_error" };
      const body = (await res.json()) as { id?: string };
      return { ok: true, providerMessageId: body.id, costMinorUnits: 0 };
    },
  };
}
