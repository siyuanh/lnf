import { describe, it, expect } from "vitest";
import { safeNext } from "../src/lib/safe-next";

describe("safeNext open-redirect guard", () => {
  it("allows valid relative paths", () => {
    expect(safeNext("/caregiver/people")).toBe("/caregiver/people");
    expect(safeNext("/f/ABCD1234")).toBe("/f/ABCD1234");
    expect(safeNext("/")).toBe("/");
    expect(safeNext("/a")).toBe("/a");
  });

  it("rejects null and empty string", () => {
    expect(safeNext(null)).toBe(null);
    expect(safeNext("")).toBe(null);
  });

  it("rejects protocol-relative URLs (//)", () => {
    expect(safeNext("//evil.com")).toBe(null);
    expect(safeNext("//evil.com/path")).toBe(null);
    expect(safeNext("///evil.com")).toBe(null);
  });

  it("rejects backslash variants (/\\)", () => {
    expect(safeNext("/\\evil.com")).toBe(null);
    expect(safeNext("/\\\\evil.com")).toBe(null);
  });

  it("rejects absolute URLs", () => {
    // safeNext only checks for leading `/` — absolute URLs don't start with `/`
    expect(safeNext("http://evil.com")).toBe(null);
    expect(safeNext("https://evil.com")).toBe(null);
    expect(safeNext("javascript:alert(1)")).toBe(null);
  });

  it("rejects paths not starting with /", () => {
    expect(safeNext("caregiver/people")).toBe(null);
    expect(safeNext("evil.com")).toBe(null);
  });
});
