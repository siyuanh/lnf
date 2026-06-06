import { randomBytes } from "node:crypto";

// Crockford base32 (no I, L, O, U) — readable when printed onto fabric.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * 22 chars × 5 bits = 110 bits of entropy. Astronomically collision-resistant;
 * the unique-violation retry in the mint loop exists only to fail loudly if
 * the entropy source is broken (per spec §4.1 #1).
 */
export function generateCode(): string {
  const bytes = randomBytes(14); // 14 bytes = 112 bits, we use 110
  let out = "";
  let bits = 0;
  let acc = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5 && out.length < 22) {
      bits -= 5;
      out += ALPHABET[(acc >>> bits) & 0x1f];
    }
  }
  return out.slice(0, 22);
}

export function generateCodes(count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(generateCode());
  return out;
}
