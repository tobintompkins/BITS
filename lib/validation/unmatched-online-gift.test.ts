import { describe, expect, it } from "vitest";

import {
  matchUnmatchedOnlineGiftSchema,
  parseUnmatchedGiftQueueQuery,
} from "./unmatched-online-gift";

describe("unmatched gift query validation", () => {
  it("validates queue query parameters before they are used", () => {
    const parsed = parseUnmatchedGiftQueueQuery({
      q: "tithes",
      environment: "test",
      page: "2",
      sort: "totalAmount",
      order: "asc",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toMatchObject({
        q: "tithes",
        environment: "test",
        page: 2,
        sort: "totalAmount",
        order: "asc",
      });
    }
  });

  it("rejects invalid dates and environments", () => {
    expect(parseUnmatchedGiftQueueQuery({ date: "13-40" }).success).toBe(false);
    expect(parseUnmatchedGiftQueueQuery({ environment: "sandbox" }).success).toBe(
      false,
    );
  });

  it("requires explicit confirmation for a match", () => {
    expect(
      matchUnmatchedOnlineGiftSchema.safeParse({
        donationId: "00000000-0000-4000-8000-00000000b001",
        donorId: "00000000-0000-4000-8000-00000000d001",
        confirmed: false,
      }).success,
    ).toBe(false);
  });
});
