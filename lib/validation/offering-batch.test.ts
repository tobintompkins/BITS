import { describe, expect, it } from "vitest";

import {
  offeringBatchWriteSchema,
  parseOfferingBatchDirectoryQuery,
} from "./offering-batch";

describe("offering batch validation", () => {
  it("accepts a valid write payload and normalizes blanks to null", () => {
    const parsed = offeringBatchWriteSchema.safeParse({
      name: "  Sunday AM  ",
      offeringDate: "2026-09-06",
      serviceDescription: "  ",
      expectedTotal: "125.50",
      notes: "",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({
        name: "Sunday AM",
        offeringDate: "2026-09-06",
        serviceDescription: null,
        expectedTotal: "125.50",
        notes: null,
      });
    }
  });

  it("rejects invalid money, dates, and empty names", () => {
    expect(
      offeringBatchWriteSchema.safeParse({
        name: "",
        offeringDate: "2026-09-06",
        serviceDescription: "",
        expectedTotal: "",
        notes: "",
      }).success,
    ).toBe(false);
    expect(
      offeringBatchWriteSchema.safeParse({
        name: "Sunday",
        offeringDate: "09/06/2026",
        serviceDescription: "",
        expectedTotal: "",
        notes: "",
      }).success,
    ).toBe(false);
    expect(
      offeringBatchWriteSchema.safeParse({
        name: "Sunday",
        offeringDate: "2026-09-06",
        serviceDescription: "",
        expectedTotal: "-5.00",
        notes: "",
      }).success,
    ).toBe(false);
    expect(
      offeringBatchWriteSchema.safeParse({
        name: "Sunday",
        offeringDate: "2026-09-06",
        serviceDescription: "",
        expectedTotal: "1.239",
        notes: "",
      }).success,
    ).toBe(false);
  });

  it("validates directory query parameters", () => {
    const parsed = parseOfferingBatchDirectoryQuery({
      q: "sunday",
      status: "DRAFT",
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
      page: "2",
      sort: "expectedTotal",
      order: "asc",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toMatchObject({
        q: "sunday",
        status: "DRAFT",
        dateFrom: "2026-09-01",
        dateTo: "2026-09-30",
        page: 2,
        sort: "expectedTotal",
        order: "asc",
      });
    }
  });

  it("rejects invalid directory filters", () => {
    expect(parseOfferingBatchDirectoryQuery({ status: "OPEN" }).success).toBe(
      false,
    );
    expect(parseOfferingBatchDirectoryQuery({ dateFrom: "13-40" }).success).toBe(
      false,
    );
    expect(parseOfferingBatchDirectoryQuery({ sort: "notes" }).success).toBe(
      false,
    );
  });
});
