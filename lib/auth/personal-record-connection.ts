export const PERSONAL_RECORD_LINK_PENDING_COPY =
  "An administrator needs to connect your existing church record to this sign-in. A matching name or email is not used, and this page does not create a record.";

export type PersonalRecordKind = "donor" | "member" | "profile";

export function planPersonalRecordConnection(input: {
  accountId: string;
  accountActive: boolean;
  records: {
    kind: PersonalRecordKind;
    id: string;
    linkedAccountId: string | null;
  }[];
}) {
  if (!input.accountActive) {
    return { ok: false as const, reason: "ACCOUNT_INACTIVE" as const };
  }
  if (input.records.length === 0) {
    return { ok: false as const, reason: "NOTHING_SELECTED" as const };
  }
  const blocked = input.records.find(
    (record) => record.linkedAccountId && record.linkedAccountId !== input.accountId,
  );
  if (blocked) {
    return {
      ok: false as const,
      reason: "OWNED_BY_SOMEONE_ELSE" as const,
      kind: blocked.kind,
    };
  }
  return {
    ok: true as const,
    links: input.records.map((record) => ({
      kind: record.kind,
      id: record.id,
      action:
        record.linkedAccountId === input.accountId
          ? ("reuse" as const)
          : ("link" as const),
    })),
  };
}
