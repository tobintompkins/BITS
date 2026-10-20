import { describe, expect, it, vi } from "vitest";

import { createAttendanceFoundationFixture } from "@/server/repositories/event-attendance.fixtures";

function createPartialSetupClient() {
  const deleted: string[] = [];
  let orgCreates = 0;
  const deleteMany = (label: string) =>
    vi.fn(async () => {
      deleted.push(label);
      return { count: 0 };
    });

  const db = {
    userAccount: {
      create: vi.fn(async () => ({ id: "user-1" })),
      deleteMany: deleteMany("userAccount"),
    },
    organization: {
      create: vi.fn(async () => {
        orgCreates += 1;
        if (orgCreates === 2) throw new Error("partial setup");
        return { id: "org-1" };
      }),
      deleteMany: deleteMany("organization"),
    },
    member: { create: vi.fn(), deleteMany: deleteMany("member") },
    event: { create: vi.fn(), deleteMany: deleteMany("event") },
    eventRegistration: { create: vi.fn(), deleteMany: deleteMany("eventRegistration") },
    eventAttendee: { deleteMany: deleteMany("eventAttendee") },
    eventAttendanceAction: { deleteMany: deleteMany("eventAttendanceAction") },
    eventAttendanceRecord: { deleteMany: deleteMany("eventAttendanceRecord") },
    eventQrPass: { deleteMany: deleteMany("eventQrPass") },
    eventCheckInIdempotency: { deleteMany: deleteMany("eventCheckInIdempotency") },
    eventCheckInStation: { deleteMany: deleteMany("eventCheckInStation") },
    eventCheckInSettings: { deleteMany: deleteMany("eventCheckInSettings") },
    auditEvent: { deleteMany: deleteMany("auditEvent") },
    organizationMembership: { deleteMany: deleteMany("organizationMembership") },
  };

  return { db, deleted };
}

describe("owned attendance fixtures", () => {
  it("cleans up already-created churches after a partial setup failure", async () => {
    const { db, deleted } = createPartialSetupClient();
    await expect(
      createAttendanceFoundationFixture(db as never, "iso-partial"),
    ).rejects.toThrow(/partial setup/);
    expect(db.organization.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["org-1"] } },
    });
    expect(db.userAccount.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["user-1"] } },
    });
    expect(deleted).toContain("organization");
    expect(deleted).toContain("userAccount");
  });
});
