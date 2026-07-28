import type { Env } from "../env.js";
import { makeFakeSenders, type SenderRegistry } from "./senders.js";
import { makeResendSender } from "./resend.js";
import { makeTwilioSmsSender, makeTwilioVoiceSender } from "./twilio.js";

/**
 * Build senders from env. Missing provider credentials fall back to fakes, so
 * dev/test exercise the full chain with zero spend. Production with a missing
 * provider still boots — attempts log failure_reason='provider_not_configured'
 * only if the fake is replaced; fakes report success and record calls, which
 * is the intended dev behavior.
 */
export function makeRegistry(env: Pick<Env, "RESEND_API_KEY" | "EMAIL_FROM" | "TWILIO_ACCOUNT_SID" | "TWILIO_AUTH_TOKEN" | "TWILIO_FROM_NUMBER" | "NODE_ENV">): SenderRegistry {
  const fake = makeFakeSenders().senders;
  const registry: SenderRegistry = { ...fake };
  if (env.RESEND_API_KEY && env.EMAIL_FROM) registry.email = makeResendSender(env.RESEND_API_KEY, env.EMAIL_FROM);
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER) {
    const creds = { accountSid: env.TWILIO_ACCOUNT_SID, authToken: env.TWILIO_AUTH_TOKEN, fromNumber: env.TWILIO_FROM_NUMBER };
    registry.sms = makeTwilioSmsSender(creds);
    registry.voice = makeTwilioVoiceSender(creds);
  }
  return registry;
}
