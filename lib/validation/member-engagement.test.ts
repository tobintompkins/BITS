import { describe, expect, it } from "vitest";

import {
  memberDocumentMetadataSchema,
  memberMilestoneSchema,
  memberMinistrySchema,
  memberSkillSchema,
  memberSpiritualGiftSchema,
  ministrySchema,
  spiritualGiftSchema,
} from "@/lib/validation/member-engagement";

const memberId = "00000000-0000-4000-8000-000000000201";
const giftId = "00000000-0000-4000-8000-000000000901";
const ministryId = "00000000-0000-4000-8000-000000000911";

describe("memberMilestoneSchema", () => {
  it("requires member, type, title, and date", () => {
    const result = memberMilestoneSchema.safeParse({
      memberId: "",
      milestoneType: "",
      title: "",
      milestoneDate: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a baptism milestone with sync flag", () => {
    const result = memberMilestoneSchema.safeParse({
      memberId,
      milestoneType: "BAPTISM",
      title: "Baptism Sunday",
      milestoneDate: "2026-07-01",
      syncMemberDates: true,
    });
    expect(result.success).toBe(true);
  });
});

describe("spiritualGiftSchema", () => {
  it("requires a gift name", () => {
    const result = spiritualGiftSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("defaults isActive to true", () => {
    const result = spiritualGiftSchema.safeParse({ name: "Teaching" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isActive).toBe(true);
    }
  });
});

describe("memberSpiritualGiftSchema", () => {
  it("requires member, gift, and proficiency", () => {
    const result = memberSpiritualGiftSchema.safeParse({
      memberId: "",
      spiritualGiftId: "",
      proficiencyLevel: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid assignment", () => {
    const result = memberSpiritualGiftSchema.safeParse({
      memberId,
      spiritualGiftId: giftId,
      proficiencyLevel: "CONFIDENT",
      isPrimary: true,
    });
    expect(result.success).toBe(true);
  });
});

describe("ministrySchema", () => {
  it("requires name and ministry type", () => {
    const result = ministrySchema.safeParse({
      name: "",
      ministryType: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid ministry", () => {
    const result = ministrySchema.safeParse({
      name: "Worship Team",
      ministryType: "WORSHIP",
      meetingSchedule: "Sundays 8am",
    });
    expect(result.success).toBe(true);
  });
});

describe("memberMinistrySchema", () => {
  it("requires member, ministry, role, and status", () => {
    const result = memberMinistrySchema.safeParse({
      memberId: "",
      ministryId: "",
      role: "",
      status: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a volunteer assignment", () => {
    const result = memberMinistrySchema.safeParse({
      memberId,
      ministryId,
      role: "VOLUNTEER",
      status: "ACTIVE",
      isLeader: false,
    });
    expect(result.success).toBe(true);
  });
});

describe("memberSkillSchema", () => {
  it("requires skill name and proficiency", () => {
    const result = memberSkillSchema.safeParse({
      memberId,
      skillName: "",
      proficiencyLevel: "",
    });
    expect(result.success).toBe(false);
  });

  it("parses yearsExperience from string", () => {
    const result = memberSkillSchema.safeParse({
      memberId,
      skillName: "Sound Board",
      proficiencyLevel: "ADVANCED",
      yearsExperience: "5",
      isAvailableToServe: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.yearsExperience).toBe(5);
    }
  });
});

describe("memberDocumentMetadataSchema", () => {
  it("requires member, type, and title", () => {
    const result = memberDocumentMetadataSchema.safeParse({
      memberId: "",
      documentType: "",
      title: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts confidential document metadata", () => {
    const result = memberDocumentMetadataSchema.safeParse({
      memberId,
      documentType: "BACKGROUND_CHECK",
      title: "Background check 2026",
      isConfidential: true,
      expirationDate: "2026-08-01",
    });
    expect(result.success).toBe(true);
  });
});
