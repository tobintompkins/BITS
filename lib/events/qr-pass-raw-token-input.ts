import { inspect } from "node:util";

import { EVENT_QR_PASS_RAW_TOKEN_MAX_LENGTH } from "@/lib/constants/event-qr-pass";
import {
  hashQrPassToken,
  parseQrPassPayload,
} from "@/lib/events/qr-pass-token";

const REDACTED = "[REDACTED]";

/**
 * Blueprint 7.3T — secret-bearing raw token input.
 * Hash immediately via `consumeTokenHash()`; never log or serialize the raw value.
 */
export class QrPassRawTokenInput {
  #raw: string | null;

  private constructor(raw: string) {
    this.#raw = raw;
  }

  static fromUnknown(value: unknown): QrPassRawTokenInput | null {
    if (typeof value !== "string") return null;
    if (value.length === 0 || value.length > EVENT_QR_PASS_RAW_TOKEN_MAX_LENGTH) {
      return null;
    }
    // Reject strings that are only whitespace without mutating a secret trim policy.
    if (value.trim().length === 0) return null;
    return new QrPassRawTokenInput(value);
  }

  /**
   * Parse payload prefix if present, hash once, and clear the in-memory raw value.
   */
  consumeTokenHash(): string | null {
    if (this.#raw == null) return null;
    const opaque = parseQrPassPayload(this.#raw);
    if (
      opaque.length === 0 ||
      opaque.length > EVENT_QR_PASS_RAW_TOKEN_MAX_LENGTH
    ) {
      this.#raw = null;
      return null;
    }
    const hash = hashQrPassToken(opaque);
    this.#raw = null;
    return hash;
  }

  toJSON() {
    return { rawToken: REDACTED };
  }

  toString() {
    return `QrPassRawTokenInput(${REDACTED})`;
  }

  [inspect.custom]() {
    return this.toString();
  }
}
