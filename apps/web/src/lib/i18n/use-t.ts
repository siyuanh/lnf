"use client";
import { tFor, type DictKey } from "./dict";
import { useLocale } from "./provider";

// Client-side translator. Locale comes from a React Context populated by the
// server's getLocale() — see provider.tsx for the rationale (avoids SSR/CSR
// hydration mismatch).
export function useT(): (key: DictKey, vars?: Record<string, string | number>) => string {
  return tFor(useLocale());
}
