"use client";
import { LOCALES, LOCALE_COOKIE, type Locale } from "@/lib/i18n/dict";

interface Props {
  current: Locale;
}

const LABEL: Record<Locale, string> = {
  en: "English",
  es: "Español",
  "pt-BR": "Português",
};

// Top-right toggle, cycles en → es → pt-BR. Writes the cookie client-side and
// reloads so server components re-render against the new locale. Reload is the
// simplest path — otherwise we'd need a full client-side i18n provider for the
// few pages that aren't server components.
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
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        padding: "4px 10px",
        fontSize: 13,
        fontFamily: "system-ui",
        background: "white",
        border: "1px solid #ccc",
        borderRadius: 4,
        cursor: "pointer",
        zIndex: 100,
      }}
      aria-label={`Switch to ${label}`}
    >
      {label}
    </button>
  );
}
