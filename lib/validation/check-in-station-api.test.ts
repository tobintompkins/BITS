import { describe, expect, it } from "vitest";

import {
  closeCheckInStationApiBodySchema,
  listCheckInStationsApiQuerySchema,
  openCheckInStationApiBodySchema,
} from "@/lib/validation/check-in-station-api";

describe("check-in station API validation", () => {
  it("accepts a valid open body and rejects server-owned fields", () => {
    const ok = openCheckInStationApiBodySchema.safeParse({
      name: " Welcome Desk ",
      deviceLabel: "Lobby tablet",
    });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.name).toBe("Welcome Desk");
    }

    expect(
      openCheckInStationApiBodySchema.safeParse({
        name: "Desk",
        status: "ACTIVE",
        organizationId: "00000000-0000-4000-8000-000000000099",
      }).success,
    ).toBe(false);
  });

  it("rejects blank/overlong names", () => {
    expect(
      openCheckInStationApiBodySchema.safeParse({ name: "  " }).success,
    ).toBe(false);
    expect(
      openCheckInStationApiBodySchema.safeParse({ name: "x".repeat(81) })
        .success,
    ).toBe(false);
  });

  it("validates list query pagination and status filter", () => {
    expect(
      listCheckInStationsApiQuerySchema.safeParse({
        page: "1",
        pageSize: "25",
        status: "ACTIVE",
      }).success,
    ).toBe(true);

    expect(
      listCheckInStationsApiQuerySchema.safeParse({ status: "OPEN" }).success,
    ).toBe(false);

    expect(
      listCheckInStationsApiQuerySchema.safeParse({ pageSize: "101" }).success,
    ).toBe(false);
  });

  it("rejects close bodies with fields", () => {
    expect(closeCheckInStationApiBodySchema.safeParse({}).success).toBe(true);
    expect(
      closeCheckInStationApiBodySchema.safeParse({ closedAt: "now" }).success,
    ).toBe(false);
  });
});
