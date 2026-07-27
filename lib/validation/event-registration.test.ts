import { describe, expect, it } from "vitest";

import {
  generateConfirmationCode,
  registrationSettingsSchema,
  submitRegistrationSchema,
} from "@/lib/validation/event-registration";
import {
  signCheckInPayload,
  verifyCheckInPayload,
} from "@/lib/events/check-in-token";
import {
  generatePromotionOfferToken,
  hashPromotionOfferToken,
  promotionOfferTokensMatch,
} from "@/lib/events/promotion-offer-token";
import { COUNTED_TOWARD_CAPACITY_STATUSES } from "@/lib/constants/event-registration";
import { RegistrationError } from "@/lib/errors/registration-errors";

describe("registration settings validation", () => {
  it("rejects close before open", () => {
    const result = registrationSettingsSchema.safeParse({
      eventId: "00000000-0000-4000-8000-000000000001",
      isEnabled: true,
      opensAt: "2026-08-10T10:00",
      closesAt: "2026-08-09T10:00",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid settings", () => {
    const result = registrationSettingsSchema.safeParse({
      eventId: "00000000-0000-4000-8000-000000000001",
      isEnabled: true,
      capacity: 100,
      waitlistEnabled: true,
      maxAttendeesPerRegistration: 4,
      promotionOfferTtlMinutes: 1440,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.promotionOfferTtlMinutes).toBe(1440);
    }
  });

  it("rejects too-short promotion offer TTL", () => {
    const result = registrationSettingsSchema.safeParse({
      eventId: "00000000-0000-4000-8000-000000000001",
      promotionOfferTtlMinutes: 5,
    });
    expect(result.success).toBe(false);
  });
});

describe("submit registration validation", () => {
  it("requires attendees", () => {
    const result = submitRegistrationSchema.safeParse({
      eventId: "00000000-0000-4000-8000-000000000001",
      primaryContactName: "Alex Rivera",
      attendees: [],
    });
    expect(result.success).toBe(false);
  });

  it("accepts a guest party", () => {
    const result = submitRegistrationSchema.safeParse({
      eventId: "00000000-0000-4000-8000-000000000001",
      primaryContactName: "Alex Rivera",
      primaryContactEmail: "alex@example.com",
      attendees: [
        {
          firstName: "Alex",
          lastName: "Rivera",
          email: "alex@example.com",
          isGuest: true,
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("confirmation and check-in tokens", () => {
  it("generates confirmation codes", () => {
    expect(generateConfirmationCode()).toHaveLength(8);
  });

  it("signs and verifies check-in payloads", () => {
    const attendeeId = "00000000-0000-4000-8000-000000000010";
    const eventId = "00000000-0000-4000-8000-000000000020";
    const token = signCheckInPayload(attendeeId, eventId);
    const verified = verifyCheckInPayload(token, eventId);
    expect(verified.ok).toBe(true);
    if (verified.ok) expect(verified.attendeeId).toBe(attendeeId);
  });

  it("rejects tampered tokens", () => {
    const token = signCheckInPayload(
      "00000000-0000-4000-8000-000000000010",
      "00000000-0000-4000-8000-000000000020",
    );
    const verified = verifyCheckInPayload(token, "00000000-0000-4000-8000-000000000099");
    expect(verified.ok).toBe(false);
  });
});

describe("promotion offer tokens", () => {
  it("hashes and matches one-time offer tokens", () => {
    const raw = generatePromotionOfferToken();
    const hash = hashPromotionOfferToken(raw);
    expect(hash).toHaveLength(64);
    expect(promotionOfferTokensMatch(raw, hash)).toBe(true);
    expect(promotionOfferTokensMatch("not-the-token", hash)).toBe(false);
  });

  it("never stores the raw token as the hash", () => {
    const raw = generatePromotionOfferToken();
    expect(hashPromotionOfferToken(raw)).not.toBe(raw);
  });
});

describe("capacity status machine", () => {
  it("reserves seats for OFFERED registrations", () => {
    expect(COUNTED_TOWARD_CAPACITY_STATUSES).toContain("OFFERED");
    expect(COUNTED_TOWARD_CAPACITY_STATUSES).toContain("CONFIRMED");
    expect(COUNTED_TOWARD_CAPACITY_STATUSES).not.toContain("WAITLISTED");
  });

  it("exposes stable registration error codes", () => {
    const error = new RegistrationError(
      "CAPACITY_UNAVAILABLE",
      "This event is at capacity.",
    );
    expect(error.code).toBe("CAPACITY_UNAVAILABLE");
    expect(error.message).toContain("capacity");
  });
});

describe("sensitive attendee fields on submit", () => {
  it("accepts accommodation and dietary notes", () => {
    const result = submitRegistrationSchema.safeParse({
      eventId: "00000000-0000-4000-8000-000000000001",
      primaryContactName: "Alex Rivera",
      attendees: [
        {
          firstName: "Alex",
          lastName: "Rivera",
          accommodationRequest: "Wheelchair access",
          dietaryNotes: "Vegetarian",
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});
