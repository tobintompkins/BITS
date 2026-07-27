import { inspect } from "node:util";

import type { EventQrPassPurpose } from "@/lib/constants/event-qr-pass";

const REDACTED = "[REDACTED]";

/**
 * Blueprint 7.3Q — one-time secret-bearing issuance/rotation result.
 * Raw token is private; never place this object in audit metadata.
 */
export class QrPassSecretResult {
  readonly passId: string;
  readonly eventId: string;
  readonly registrationId: string;
  readonly attendeeId: string | null;
  readonly purpose: EventQrPassPurpose;
  readonly expiresAt: Date;
  /** True when an existing active pass was returned without a new secret. */
  readonly reused: boolean;
  readonly #rawToken: string | null;

  constructor(input: {
    passId: string;
    eventId: string;
    registrationId: string;
    attendeeId?: string | null;
    purpose: EventQrPassPurpose;
    expiresAt: Date;
    reused: boolean;
    rawToken: string | null;
  }) {
    this.passId = input.passId;
    this.eventId = input.eventId;
    this.registrationId = input.registrationId;
    this.attendeeId = input.attendeeId ?? null;
    this.purpose = input.purpose;
    this.expiresAt = input.expiresAt;
    this.reused = input.reused;
    this.#rawToken = input.rawToken;
  }

  /** Opaque bearer token — available only on fresh issue/rotate. */
  get rawToken(): string | null {
    return this.#rawToken;
  }

  /** Safe metadata for logs/audit helpers (never includes secrets or hashes). */
  toSafeMetadata() {
    return {
      passId: this.passId,
      eventId: this.eventId,
      registrationId: this.registrationId,
      attendeeId: this.attendeeId,
      purpose: this.purpose,
      expiresAt: this.expiresAt.toISOString(),
      reused: this.reused,
      rawToken: this.#rawToken ? REDACTED : null,
    };
  }

  toJSON() {
    return this.toSafeMetadata();
  }

  toString() {
    return `QrPassSecretResult(${JSON.stringify(this.toSafeMetadata())})`;
  }

  [inspect.custom]() {
    return this.toString();
  }
}

export type QrPassRevokeResult = {
  passId: string;
  eventId: string;
  registrationId: string;
  attendeeId: string | null;
  purpose: EventQrPassPurpose;
  status: "REVOKED" | "REPLACED" | "EXPIRED" | "ACTIVE";
  transitioned: boolean;
  revokedAt: Date | null;
};
