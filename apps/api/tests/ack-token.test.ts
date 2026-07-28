import { describe, it, expect } from "vitest";
import { signAckAttempt, verifyAckAttempt } from "../src/notify/ack-token.js";

const SECRET = "test_ack_secret_at_least_32_chars_xxx";

describe("ack-token", () => {
  it("round-trips an attempt id", () => {
    const id = "8f9a5c6e-3f2a-4b1c-9d0e-1a2b3c4d5e6f";
    const token = signAckAttempt(id, SECRET);
    expect(verifyAckAttempt(token, SECRET)).toBe(id);
  });

  it("rejects a token signed with a different secret", () => {
    const token = signAckAttempt("8f9a5c6e-3f2a-4b1c-9d0e-1a2b3c4d5e6f", SECRET);
    expect(verifyAckAttempt(token, "other_secret_at_least_32_chars_xxxx")).toBeNull();
  });

  it("rejects a tampered token", () => {
    const token = signAckAttempt("8f9a5c6e-3f2a-4b1c-9d0e-1a2b3c4d5e6f", SECRET);
    expect(verifyAckAttempt(token.slice(0, -2) + "zz", SECRET)).toBeNull();
    expect(verifyAckAttempt("not-a-token", SECRET)).toBeNull();
  });
});
