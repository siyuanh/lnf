"use client";
import { LOCALES, LOCALE_COOKIE, type Locale } from "@/lib/i18n/dict";

interface Props {
  current: Locale;
}

const LABEL: Record<Locale, string> = {
  en: "English",
  es: "Español",
};

// Toggles en → es. Writes the cookie client-side and reloads so server
// components re-render against the new locale. Reload is the simplest path —
// otherwise we'd need a full client-side i18n provider for the few pages that
// aren't server components.
export function LangSwitcher({ current }: Props) {
  // Modulo always lands in range; noUncheckedIndexedAccess still wants the proof.
  const next = LOCALES[(LOCALES.indexOf(current) + 1) % LOCALES.length]!;
  const label = LABEL[next];

  function onClick() {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    window.location.reload();
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-navy-900 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      aria-label={`Switch to ${label}`}
    >
      {label}
    </button>
  );
}
