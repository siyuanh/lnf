import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE, LOCALES, DEFAULT_LOCALE } from "./src/lib/i18n/dict";

// On first visit, sniff Accept-Language and set the locale cookie so server
// components and the switcher both read from the same source. Subsequent
// requests are no-ops (cookie already present).
//
// We MUST inline the picker logic here — middleware runs on the Edge runtime
// and can't import next/headers. Keep this in lockstep with pickLocale() in
// src/lib/i18n/server.ts.
export function middleware(req: NextRequest) {
  if (req.cookies.get(LOCALE_COOKIE)) return NextResponse.next();

  const accept = req.headers.get("accept-language");
  let locale: string = DEFAULT_LOCALE;
  if (accept) {
    for (const part of accept.split(",")) {
      const tag = part.split(";")[0]!.trim().toLowerCase();
      const primary = tag.split("-")[0];
      if (primary && (LOCALES as readonly string[]).includes(primary)) {
        locale = primary;
        break;
      }
    }
  }

  const res = NextResponse.next();
  res.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return res;
}

export const config = {
  // Skip static assets, image optimizer, and the api proxy. The api sidecar
  // doesn't care about locale.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
