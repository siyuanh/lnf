import { describe, it, expect } from "vitest";
import { pickLocale } from "../src/lib/i18n/server";
import { dict, tFor, LOCALES, DEFAULT_LOCALE } from "../src/lib/i18n/dict";

describe("pickLocale", () => {
  it("cookie wins when valid", () => {
    expect(pickLocale("en", "es-MX,es;q=0.9")).toBe("en");
    expect(pickLocale("es", "en-US")).toBe("es");
  });

  it("ignores an invalid cookie and falls through to the header", () => {
    expect(pickLocale("pt-BR", "en-US,en;q=0.9")).toBe("en");
  });

  it("matches es and en by primary subtag", () => {
    expect(pickLocale(undefined, "es-CO,es;q=0.9,en;q=0.8")).toBe("es");
    expect(pickLocale(undefined, "en-US,en;q=0.9")).toBe("en");
  });

  it("honors header order (highest priority first)", () => {
    expect(pickLocale(undefined, "en;q=0.8,es;q=0.9")).toBe("en");
  });

  it("defaults to Spanish when the header is missing or unsupported (§5.9)", () => {
    expect(pickLocale(undefined, null)).toBe(DEFAULT_LOCALE);
    expect(DEFAULT_LOCALE).toBe("es");
    expect(pickLocale(undefined, "fr-FR,fr;q=0.9")).toBe("es");
    expect(pickLocale(undefined, "pt-BR,pt;q=0.9")).toBe("es");
  });
});

describe("dictionaries", () => {
  it("en and es have identical key sets", () => {
    const keys = (l: (typeof LOCALES)[number]) => Object.keys(dict[l]).sort();
    expect(keys("es")).toEqual(keys("en"));
  });

  it("every locale renders every key to a non-empty string", () => {
    for (const locale of LOCALES) {
      const t = tFor(locale);
      for (const key of Object.keys(dict.en) as (keyof typeof dict.en)[]) {
        expect(t(key), `${locale}:${key}`).not.toBe("");
      }
    }
  });

  it("es interpolates vars", () => {
    expect(tFor("es")("newBatch.codeCount", { n: 120 })).toBe("120 códigos");
  });

  it("falls back to the key itself for a key missing from a locale", () => {
    const t = tFor("es");
    // Construct an artificial miss by asking for a key cast from a non-key.
    expect(t("does.not.exist" as never)).toBe("does.not.exist");
  });
});
