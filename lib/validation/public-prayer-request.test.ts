import { describe, expect, it } from "vitest";

import { publicPrayerRequestSchema } from "./public-prayer-request";

describe("public prayer request validation", () => {
  it("accepts a private anonymous request", () => {
    const result = publicPrayerRequestSchema.safeParse({
      request: "Please pray for my family.",
      anonymous: true,
      sharePublicly: false,
    });
    expect(result.success).toBe(true);
  });

  it("accepts immediate public sharing", () => {
    const result = publicPrayerRequestSchema.safeParse({
      name: "Toby",
      request: "Please pray for healing.",
      anonymous: false,
      sharePublicly: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty, oversized, and honeypot submissions", () => {
    expect(publicPrayerRequestSchema.safeParse({ request: "" }).success).toBe(
      false,
    );
    expect(
      publicPrayerRequestSchema.safeParse({ request: "x".repeat(2001) }).success,
    ).toBe(false);
    expect(
      publicPrayerRequestSchema.safeParse({
        request: "A real-looking request",
        website: "spam",
      }).success,
    ).toBe(false);
  });
});
