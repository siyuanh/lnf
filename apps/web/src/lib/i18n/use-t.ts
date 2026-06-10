"use client";
import { LOCALE_COOKIE, DEFAULT_LOCALE, type Locale, LOCALES, tFor, type DictKey } from "./dict";

function readLocale(): Locale {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  // Cookie format: "lnf_locale=es; ...". Plain split is enough — the cookie
  // value is "en" or "es", no escaping concerns.
  const m = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]+)`));
  const v = m?.[1];
  return v && (LOCALES as readonly string[]).includes(v) ? (v as Locale) : DEFAULT_LOCALE;
}

// Client-side translator. Reads the cookie once per render — fine for a
// portal where the locale only changes via a full page reload from
// LangSwitcher.
export function useT(): (key: DictKey, vars?: Record<string, string | number>) => string {
  return tFor(readLocale());
}
