import { randomBytes } from "node:crypto";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface MintedCsvToken {
  token: string;
  hash: string;
}

export function mintCsvToken(batchId: string): MintedCsvToken {
  const secret = base64url(randomBytes(32));
  return { token: `${batchId}.${secret}`, hash: hashCsvSecret(secret) };
}

export function splitCsvToken(token: string): { batchId: string; secret: string } | null {
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const batchId = token.slice(0, dot);
  const secret = token.slice(dot + 1);
  if (!UUID_RE.test(batchId) || secret.length === 0) return null;
  return { batchId, secret };
}

export function hashCsvSecret(secret: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(secret)));
}

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}
