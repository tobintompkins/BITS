import { describe, expect, it } from "vitest";

import {
  ORIGINAL_V1_TARGET_TOKEN_MIN_LENGTH,
  bearerTokenFromAuthorization,
  originalV1TargetFingerprint,
  timingSafeStringEquals,
} from "./original-v1-target-token";

describe("original v1 target token helpers", () => {
  it("keeps fingerprints stable for the same token and database URL", () => {
    const left = originalV1TargetFingerprint("token-value-123456", "postgres://e2e");
    const right = originalV1TargetFingerprint(
      "token-value-123456",
      "postgres://e2e",
    );
    expect(left).toHaveLength(64);
    expect(left).toBe(right);
  });

  it("changes the fingerprint when the database URL changes", () => {
    expect(
      originalV1TargetFingerprint("token-value-123456", "postgres://e2e"),
    ).not.toBe(
      originalV1TargetFingerprint("token-value-123456", "postgres://prod"),
    );
  });

  it("compares tokens in constant time and rejects length mismatches", () => {
    expect(timingSafeStringEquals("abcdef", "abcdef")).toBe(true);
    expect(timingSafeStringEquals("abcdef", "abcdeg")).toBe(false);
    expect(timingSafeStringEquals("abcdef", "abc")).toBe(false);
  });

  it("reads a bearer token and ignores other schemes", () => {
    expect(bearerTokenFromAuthorization("Bearer secret-token")).toBe(
      "secret-token",
    );
    expect(bearerTokenFromAuthorization("Basic secret-token")).toBeNull();
    expect(bearerTokenFromAuthorization(null)).toBeNull();
  });

  it("documents the minimum token length used by preflight", () => {
    expect(ORIGINAL_V1_TARGET_TOKEN_MIN_LENGTH).toBe(16);
  });
});
