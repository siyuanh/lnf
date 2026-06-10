"use client";
import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_LOCALE, type Locale } from "./dict";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

// The server reads the locale cookie via next/headers and seeds this Context
// for every request. Client components consume it via useLocale()/useT() —
// reading from Context (not document.cookie) keeps SSR and the post-hydration
// render in lockstep, so React doesn't discard the client render as a
// mismatch.
export function LocaleProvider({ value, children }: { value: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}
