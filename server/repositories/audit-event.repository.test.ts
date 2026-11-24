import { describe, expect, it, vi } from "vitest";

import { createAuditEvent } from "@/server/repositories/audit-event.repository";

const ORG = "00000000-0000-4000-8000-000000000001";
const ACTOR = "00000000-0000-4000-8000-0000000000aa";
const PROFILE = "00000000-0000-4000-8000-0000000000cc";

function writer() {
  const create = vi.fn().mockResolvedValue({ id: PROFILE });
  return { create, db: { auditEvent: { create } } };
}

describe("createAuditEvent", () => {
  it("refuses a profile name before any audit row is written", async () => {
    const { create, db } = writer();
    await expect(
      createAuditEvent(
        {
          organizationId: ORG,
          actorUserAccountId: ACTOR,
          action: "CHURCH_PROFILE_LINK",
          entityType: "ChurchPersonProfile",
          entityId: "tobin-tompkins",
          changes: [],
        },
        db,
      ),
    ).rejects.toThrow("Audit entityId must be an id.");
    expect(create).not.toHaveBeenCalled();
  });

  it("writes the audit when the profile id is valid", async () => {
    const { create, db } = writer();
    await createAuditEvent(
      {
        organizationId: ORG,
        actorUserAccountId: ACTOR,
        action: "CHURCH_PROFILE_LINK",
        entityType: "ChurchPersonProfile",
        entityId: PROFILE,
        changes: [{ field: "linkedUserAccountId", oldValue: null, newValue: ACTOR }],
      },
      db,
    );
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]?.[0].data.entityId).toBe(PROFILE);
  });
});
