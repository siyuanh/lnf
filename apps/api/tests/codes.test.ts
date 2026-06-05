import { describe, it, expect } from "vitest";
import { generateCode, generateCodes } from "../src/codes/generate.js";

describe("generateCode", () => {
  it("returns 22 chars in base32 alphabet (Crockford-safe)", () => {
    const code = generateCode();
    expect(code).toHaveLength(22);
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/);
  });

  it("is non-deterministic across calls", () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateCode()));
    expect(codes.size).toBe(100);
  });
});

describe("generateCodes", () => {
  it("returns the requested count of unique codes", () => {
    const codes = generateCodes(500);
    expect(codes).toHaveLength(500);
    expect(new Set(codes).size).toBe(500);
  });
});
