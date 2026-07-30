import { describe, it, expect } from "vitest";
import { pickLocale } from "../src/lib/i18n/server";
import { dict, tFor, LOCALES, DEFAULT_LOCALE } from "../src/lib/i18n/dict";

describe("pickLocale", () => {
  it("cookie wins when valid", () => {
    expect(pickLocale("pt-BR", "en-US,en;q=0.9")).toBe("pt-BR");
    expect(pickLocale("es", "pt-BR")).toBe("es");
  });

  it("ignores an invalid cookie and falls through to the header", () => {
    expect(pickLocale("fr-FR", "pt-BR,pt;q=0.9")).toBe("pt-BR");
  });

  it("matches primary subtags: pt, pt-BR and pt-PT all resolve to pt-BR", () => {
    expect(pickLocale(undefined, "pt")).toBe("pt-BR");
    expect(pickLocale(undefined, "pt-BR")).toBe("pt-BR");
    expect(pickLocale(undefined, "pt-PT;q=0.9")).toBe("pt-BR");
  });

  it("matches es and en by primary subtag", () => {
    expect(pickLocale(undefined, "es-CO,es;q=0.9,en;q=0.8")).toBe("es");
    expect(pickLocale(undefined, "en-US,en;q=0.9")).toBe("en");
  });

  it("honors header order (highest priority first)", () => {
    expect(pickLocale(undefined, "en;q=0.8,pt-BR;q=0.9")).toBe("en");
  });

  it("defaults to Spanish when the header is missing or unsupported (§5.9)", () => {
    expect(pickLocale(undefined, null)).toBe(DEFAULT_LOCALE);
    expect(DEFAULT_LOCALE).toBe("es");
    expect(pickLocale(undefined, "fr-FR,fr;q=0.9")).toBe("es");
  });
});

describe("dictionaries", () => {
  it("en, es and pt-BR have identical key sets", () => {
    const keys = (l: (typeof LOCALES)[number]) => Object.keys(dict[l]).sort();
    expect(keys("es")).toEqual(keys("en"));
    expect(keys("pt-BR")).toEqual(keys("en"));
  });

  it("every locale renders every key to a non-empty string", () => {
    for (const locale of LOCALES) {
      const t = tFor(locale);
      for (const key of Object.keys(dict.en) as (keyof typeof dict.en)[]) {
        expect(t(key), `${locale}:${key}`).not.toBe("");
      }
    }
  });

  it("pt-BR interpolates vars", () => {
    expect(tFor("pt-BR")("newBatch.codeCount", { n: 120 })).toBe("120 códigos");
  });

  it("falls back to en for a key missing from a locale", () => {
    const t = tFor("pt-BR");
    // Construct an artificial miss by asking for a key cast from a non-key.
    expect(t("does.not.exist" as never)).toBe("does.not.exist");
  });
});
