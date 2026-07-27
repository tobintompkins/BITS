import { describe, expect, it } from "vitest";

import {
  archiveMemberSchema,
  executeMergeSchema,
  markDeceasedSchema,
  restoreMemberSchema,
} from "@/lib/validation/member-lifecycle";

describe("member lifecycle validation", () => {
  it("accepts a valid archive payload", () => {
    const parsed = archiveMemberSchema.safeParse({
      memberId: "00000000-0000-4000-8000-000000000201",
      archiveReason: "Moved Away",
      notes: "Relocated",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects archive without reason", () => {
    const parsed = archiveMemberSchema.safeParse({
      memberId: "00000000-0000-4000-8000-000000000201",
      archiveReason: "",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts restore to ACTIVE or INACTIVE", () => {
    expect(
      restoreMemberSchema.safeParse({
        memberId: "00000000-0000-4000-8000-000000000201",
        restoreToStatus: "ACTIVE",
      }).success,
    ).toBe(true);
    expect(
      restoreMemberSchema.safeParse({
        memberId: "00000000-0000-4000-8000-000000000201",
        restoreToStatus: "ARCHIVED",
      }).success,
    ).toBe(false);
  });

  it("requires deceased confirmations", () => {
    const parsed = markDeceasedSchema.safeParse({
      memberId: "00000000-0000-4000-8000-000000000201",
      deceasedDate: "2024-01-01",
      confirmCommunicationRemoval: false,
      confirmDirectoryRemoval: true,
    });
    expect(parsed.success).toBe(true);
  });

  it("requires MERGE confirmation phrase", () => {
    const base = {
      primaryMemberId: "00000000-0000-4000-8000-000000000201",
      duplicateMemberId: "00000000-0000-4000-8000-000000000209",
      fieldSelections: { firstName: "primary" },
    };
    expect(
      executeMergeSchema.safeParse({
        ...base,
        confirmationPhrase: "MERGE",
      }).success,
    ).toBe(true);
    expect(
      executeMergeSchema.safeParse({
        ...base,
        confirmationPhrase: "merge",
      }).success,
    ).toBe(false);
  });
});
