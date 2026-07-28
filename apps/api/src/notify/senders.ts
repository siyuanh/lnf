import type { ChannelKind } from "@app/schemas";

export interface NotificationMessage {
  kind: ChannelKind;
  target: string; // email / e164 / push token
  subject: string;
  text: string;
  locale: "es" | "en";
  // Voice only: absolute URL Twilio's <Gather> posts the pressed digit to.
  voiceAckCallbackUrl?: string;
}

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  failureReason?: string; // 'provider_error' | 'spend_cap' | 'invalid_target'
  costMinorUnits?: number; // fake/estimated; real cost reconciles via webhooks later
}

export interface ChannelSender {
  name: string;
  kind: ChannelKind;
  send(msg: NotificationMessage): Promise<SendResult>;
}

export type SenderRegistry = Partial<Record<ChannelKind, ChannelSender>>;

export function makeFakeSenders(opts: { failKinds?: ChannelKind[] } = {}) {
  const calls: { msg: NotificationMessage; result: SendResult }[] = [];
  const make = (kind: ChannelKind): ChannelSender => ({
    name: `fake-${kind}`,
    kind,
    send: async (msg) => {
      const result: SendResult = opts.failKinds?.includes(kind)
        ? { ok: false, failureReason: "provider_error" }
        : {
            ok: true,
            providerMessageId: `fake-${kind}-${calls.length + 1}`,
            // Fake LATAM ballpark costs so spend-cap logic is exercisable:
            costMinorUnits: kind === "sms" ? 9 : kind === "voice" ? 35 : 0,
          };
      calls.push({ msg, result });
      return result;
    },
  });
  const senders: SenderRegistry = {
    email: make("email"),
    sms: make("sms"),
    voice: make("voice"),
  };
  return { senders, calls };
}
