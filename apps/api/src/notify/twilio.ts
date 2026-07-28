import type { ChannelSender, NotificationMessage, SendResult } from "./senders.js";

export interface TwilioCreds {
  accountSid: string;
  authToken: string;
  fromNumber: string; // e164, used for SMS and voice caller id
}

async function twilioPost(creds: TwilioCreds, path: string, form: Record<string, string>): Promise<{ ok: boolean; sid?: string }> {
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/${path}`, {
    method: "POST",
    headers: {
      authorization: "Basic " + Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString("base64"),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(form).toString(),
  });
  if (!res.ok) return { ok: false };
  const body = (await res.json()) as { sid?: string };
  return { ok: true, sid: body.sid };
}

function twimlAlert(msg: NotificationMessage): string {
  const gather = msg.voiceAckCallbackUrl
    ? `<Gather numDigits="1" action="${msg.voiceAckCallbackUrl}" method="POST"><Say language="es-MX">${msg.text}</Say></Gather>`
    : `<Say language="es-MX">${msg.text}</Say>`;
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${gather}</Response>`;
}

export function makeTwilioSmsSender(creds: TwilioCreds): ChannelSender {
  return {
    name: "twilio-sms",
    kind: "sms",
    async send(msg) {
      const r = await twilioPost(creds, "Messages.json", { To: msg.target, From: creds.fromNumber, Body: msg.text });
      return r.ok ? { ok: true, providerMessageId: r.sid, costMinorUnits: 9 } : { ok: false, failureReason: "provider_error" };
    },
  };
}

export function makeTwilioVoiceSender(creds: TwilioCreds): ChannelSender {
  return {
    name: "twilio-voice",
    kind: "voice",
    async send(msg) {
      const r = await twilioPost(creds, "Calls.json", { To: msg.target, From: creds.fromNumber, Twiml: twimlAlert(msg) });
      return r.ok ? { ok: true, providerMessageId: r.sid, costMinorUnits: 35 } : { ok: false, failureReason: "provider_error" };
    },
  };
}
