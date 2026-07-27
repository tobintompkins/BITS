import { describe, expect, it } from "vitest";

import {
  attendanceSchema,
  communicationSchema,
  followUpSchema,
} from "@/lib/validation/care-engagement";

describe("attendanceSchema", () => {
  it("requires member, date, service, and type", () => {
    const result = attendanceSchema.safeParse({
      memberId: "",
      attendanceDate: "",
      serviceName: "",
      attendanceType: "PRESENT",
    });
    expect(result.success).toBe(false);
  });

  it("rejects checkout before checkin", () => {
    const result = attendanceSchema.safeParse({
      memberId: "00000000-0000-4000-8000-000000000201",
      attendanceDate: "2026-07-01",
      serviceName: "Sunday Morning",
      attendanceType: "PRESENT",
      checkInTime: "11:00",
      checkOutTime: "10:00",
    });
    expect(result.success).toBe(false);
  });
});

describe("followUpSchema", () => {
  it("accepts visitor welcome follow-up", () => {
    const result = followUpSchema.safeParse({
      memberId: "00000000-0000-4000-8000-000000000201",
      followUpType: "VISITOR_WELCOME",
      status: "OPEN",
      priority: "HIGH",
      subject: "Welcome call",
    });
    expect(result.success).toBe(true);
  });
});

describe("communicationSchema", () => {
  it("requires follow-up date when follow-up enabled", () => {
    const result = communicationSchema.safeParse({
      memberId: "00000000-0000-4000-8000-000000000201",
      communicationType: "PHONE",
      direction: "OUTBOUND",
      messageSummary: "Called about visit",
      communicationDate: "2026-07-01T12:00:00.000Z",
      followUpRequired: true,
      followUpDate: "",
    });
    expect(result.success).toBe(false);
  });
});
