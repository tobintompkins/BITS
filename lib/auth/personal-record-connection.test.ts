import { describe, expect, it } from "vitest";

import { planPersonalRecordConnection } from "./personal-record-connection";

const ACCOUNT = "00000000-0000-4000-8000-0000000000aa";
const OTHER = "00000000-0000-4000-8000-0000000000bb";

describe("planPersonalRecordConnection", () => {
  it("links only the records an administrator selected", () => {
    expect(
      planPersonalRecordConnection({
        accountId: ACCOUNT,
        accountActive: true,
        records: [
          { kind: "donor", id: "donor-1", linkedAccountId: null },
          { kind: "member", id: "member-1", linkedAccountId: ACCOUNT },
          { kind: "profile", id: "profile-1", linkedAccountId: null },
        ],
      }),
    ).toEqual({
      ok: true,
      links: [
        { kind: "donor", id: "donor-1", action: "link" },
        { kind: "member", id: "member-1", action: "reuse" },
        { kind: "profile", id: "profile-1", action: "link" },
      ],
    });
  });

  it("refuses another person's record, an inactive account, and an empty selection", () => {
    expect(
      planPersonalRecordConnection({
        accountId: ACCOUNT,
        accountActive: true,
        records: [{ kind: "donor", id: "donor-1", linkedAccountId: OTHER }],
      }),
    ).toMatchObject({ ok: false, reason: "OWNED_BY_SOMEONE_ELSE" });
    expect(
      planPersonalRecordConnection({
        accountId: ACCOUNT,
        accountActive: false,
        records: [{ kind: "member", id: "member-1", linkedAccountId: null }],
      }),
    ).toMatchObject({ ok: false, reason: "ACCOUNT_INACTIVE" });
    expect(
      planPersonalRecordConnection({
        accountId: ACCOUNT,
        accountActive: true,
        records: [],
      }),
    ).toMatchObject({ ok: false, reason: "NOTHING_SELECTED" });
  });
});
