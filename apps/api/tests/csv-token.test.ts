import { describe, it, expect } from "vitest";
import { mintCsvToken, hashCsvSecret, splitCsvToken } from "../src/codes/csv-token.js";

describe("csv-token", () => {
  it("mints a token whose hash matches the stored hash", () => {
    const minted = mintCsvToken("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    const split = splitCsvToken(minted.token);
    expect(split).not.toBeNull();
    expect(split!.batchId).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    expect(hashCsvSecret(split!.secret)).toBe(minted.hash);
  });

  it("rejects malformed tokens", () => {
    expect(splitCsvToken("nope")).toBeNull();
    expect(splitCsvToken("aaa.bbb")).toBeNull();
  });
});
