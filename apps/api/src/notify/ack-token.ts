import { createHmac, timingSafeEqual } from "node:crypto";

function hmac(attemptId: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(attemptId).digest();
}

/** Sign a notification_attempt id into a URL-safe ack token (S1-4). */
export function signAckAttempt(attemptId: string, secret: string): string {
  return `${attemptId}.${hmac(attemptId, secret).toString("base64url")}`;
}

/** Verify an ack token; returns the attempt id or null when invalid. */
export function verifyAckAttempt(token: string, secret: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const attemptId = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let expected: Buffer;
  try {
    expected = hmac(attemptId, secret);
  } catch {
    return null;
  }
  const actual = Buffer.from(sig, "base64url");
  if (actual.length !== expected.length) return null;
  return timingSafeEqual(actual, expected) ? attemptId : null;
}
