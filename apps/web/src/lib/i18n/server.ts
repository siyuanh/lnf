import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALES, type Locale, tFor } from "./dict";

export function pickLocale(cookieValue: string | undefined, acceptLanguage: string | null): Locale {
  if (cookieValue && (LOCALES as readonly string[]).includes(cookieValue)) return cookieValue as Locale;
  // Accept-Language: pick the highest-q-weighted tag whose primary subtag we support.
  // Browsers send things like "es-CO,es;q=0.9,en;q=0.8" — split on comma, strip q-values,
  // take the first known primary subtag.
  if (acceptLanguage) {
    for (const part of acceptLanguage.split(",")) {
      const tag = part.split(";")[0]!.trim().toLowerCase();
      const primary = tag.split("-")[0];
      if (primary && (LOCALES as readonly string[]).includes(primary)) return primary as Locale;
    }
  }
  return DEFAULT_LOCALE;
}

export async function getLocale(): Promise<Locale> {
  const c = await cookies();
  const h = await headers();
  return pickLocale(c.get(LOCALE_COOKIE)?.value, h.get("accept-language"));
}

export async function getT() {
  const locale = await getLocale();
  return { locale, t: tFor(locale) };
}
