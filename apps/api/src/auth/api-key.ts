import { randomBytes, timingSafeEqual } from "node:crypto";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { and, eq, isNull } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import type { Db } from "../db/client.js";
import { partnerApiKey } from "../db/schema.js";

export interface MintedApiKey {
  presented: string;
  prefix: string;
  secret: string;
}

export function mintApiKey(): MintedApiKey {
  const prefix = base32(randomBytes(5)).slice(0, 8);
  const secret = base32(randomBytes(20));
  return { presented: `lnfp_${prefix}_${secret}`, prefix, secret };
}

export function hashApiKey(secret: string, pepper: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(`${pepper}.${secret}`)));
}

interface ApiKeyMiddlewareOpts {
  db: Db;
  pepper: string;
}

declare module "hono" {
  interface ContextVariableMap {
    partnerId: string;
    apiKeyId: string;
  }
}

// 32-byte zero buffer used for the dummy compare on the unknown-prefix path,
// so the middleware's response time doesn't reveal whether a prefix exists.
const DUMMY_HASH = Buffer.alloc(32);

export function makeApiKeyMiddleware(opts: ApiKeyMiddlewareOpts): MiddlewareHandler {
  return async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const match = /^Bearer\s+lnfp_([0-9A-HJKMNP-TV-Z]{8})_([0-9A-HJKMNP-TV-Z]+)$/.exec(header);
    if (!match) return unauthorized(c);
    const [, prefix, secret] = match;
    const rows = await opts.db
      .select()
      .from(partnerApiKey)
      .where(and(eq(partnerApiKey.keyPrefix, prefix!), isNull(partnerApiKey.revokedAt)))
      .limit(1);
    const row = rows[0];
    // Always run a constant-time compare even when no row was found, so an
    // attacker can't tell "valid prefix, wrong secret" from "unknown prefix"
    // by timing alone. The dummy compare guarantees equal-length buffers.
    const got = Buffer.from(hashApiKey(secret!, opts.pepper), "hex");
    const expected = row ? Buffer.from(row.keyHash, "hex") : DUMMY_HASH;
    const ok = expected.length === got.length && timingSafeEqual(expected, got);
    if (!row || !ok) return unauthorized(c);
    c.set("partnerId", row.partnerId);
    c.set("apiKeyId", row.id);
    opts.db.update(partnerApiKey).set({ lastUsedAt: new Date() }).where(eq(partnerApiKey.id, row.id))
      .catch(() => {});
    await next();
  };
}

function unauthorized(c: Context): Response {
  return c.json({ error: "unauthorized" }, 401);
}

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function base32(bytes: Uint8Array): string {
  let out = "";
  let bits = 0;
  let acc = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(acc >>> bits) & 0x1f];
    }
  }
  if (bits > 0) out += ALPHABET[(acc << (5 - bits)) & 0x1f];
  return out;
}
