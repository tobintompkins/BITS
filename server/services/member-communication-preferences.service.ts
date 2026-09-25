import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import {
  MEMBER_COMMUNICATION_PREFERENCE_FIELDS,
  memberCommunicationPreferencesSchema,
  type MemberCommunicationPreferences,
} from "@/lib/validation/member-communication-preferences";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

const preferenceSelect = {
  allowEmail: true,
  allowSms: true,
  allowPhoneCalls: true,
  allowPostalMail: true,
} as const;

const consentTypes = {
  allowEmail: "EMAIL",
  allowSms: "SMS",
  allowPhoneCalls: "PHONE_CALLS",
  allowPostalMail: "POSTAL_MAIL",
} as const;

export type MemberCommunicationPreferencesAccessResult =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "CONNECTION_PENDING"; accountEmail: string };

export type MemberCommunicationPreferencesResult =
  | MemberCommunicationPreferencesAccessResult
  | { status: "INVALID" }
  | {
      status: "READY";
      preferences: MemberCommunicationPreferences;
      unchanged?: boolean;
    };

export type MemberCommunicationPreferencesView =
  | MemberCommunicationPreferencesAccessResult
  | {
      status: "READY";
      preferences: MemberCommunicationPreferences;
    };

function toPreferences(row: MemberCommunicationPreferences) {
  return {
    allowEmail: row.allowEmail,
    allowSms: row.allowSms,
    allowPhoneCalls: row.allowPhoneCalls,
    allowPostalMail: row.allowPostalMail,
  };
}

async function resolveLinkedMemberAccess() {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" as const };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" as const };

  return {
    status: "LINKED" as const,
    userAccount,
    organization,
  };
}

/**
 * Ordinary communication permissions for the signed-in linked member.
 * Account, organization, and member are resolved server-side only.
 */
export async function getMemberCommunicationPreferences(): Promise<MemberCommunicationPreferencesView> {
  const access = await resolveLinkedMemberAccess();
  if (access.status !== "LINKED") return access;

  const member = await prisma.member.findFirst({
    where: {
      organizationId: access.organization.id,
      userAccountId: access.userAccount.id,
      recordStatus: "ACTIVE",
    },
    select: preferenceSelect,
  });
  if (!member) {
    return {
      status: "CONNECTION_PENDING",
      accountEmail: access.userAccount.primaryEmail,
    };
  }

  return {
    status: "READY",
    preferences: toPreferences(member),
  };
}

export async function updateMemberCommunicationPreferences(
  input: unknown,
): Promise<MemberCommunicationPreferencesResult> {
  const parsed = memberCommunicationPreferencesSchema.safeParse(input);
  if (!parsed.success) return { status: "INVALID" };

  const access = await resolveLinkedMemberAccess();
  if (access.status !== "LINKED") return access;

  return prisma.$transaction(async (tx) => {
    const member = await tx.member.findFirst({
      where: {
        organizationId: access.organization.id,
        userAccountId: access.userAccount.id,
        recordStatus: "ACTIVE",
      },
      select: { id: true, ...preferenceSelect },
    });
    if (!member) {
      return {
        status: "CONNECTION_PENDING",
        accountEmail: access.userAccount.primaryEmail,
      };
    }

    const next = parsed.data;
    const changedFields = MEMBER_COMMUNICATION_PREFERENCE_FIELDS.filter(
      (field) => member[field] !== next[field],
    );
    if (changedFields.length === 0) {
      return {
        status: "READY",
        preferences: toPreferences(member),
        unchanged: true,
      };
    }

    const now = new Date();
    const updated = await tx.member.updateMany({
      where: {
        id: member.id,
        organizationId: access.organization.id,
        userAccountId: access.userAccount.id,
        recordStatus: "ACTIVE",
      },
      data: {
        allowEmail: next.allowEmail,
        allowSms: next.allowSms,
        allowPhoneCalls: next.allowPhoneCalls,
        allowPostalMail: next.allowPostalMail,
        emailOptOutDate:
          member.allowEmail === next.allowEmail
            ? undefined
            : next.allowEmail
              ? null
              : now,
        smsOptOutDate:
          member.allowSms === next.allowSms
            ? undefined
            : next.allowSms
              ? null
              : now,
        consentUpdatedAt: now,
        consentUpdatedByUserId: access.userAccount.id,
      },
    });
    if (updated.count !== 1) {
      throw new Error("Unable to update your communication preferences right now.");
    }

    for (const field of changedFields) {
      await tx.memberConsentHistory.create({
        data: {
          memberId: member.id,
          consentType: consentTypes[field],
          previousValue: String(member[field]),
          newValue: String(next[field]),
          source: "MEMBER_REQUEST",
          notes: null,
          changedByUserId: access.userAccount.id,
        },
      });
    }

    await createAuditEvent(
      {
        organizationId: access.organization.id,
        actorUserAccountId: access.userAccount.id,
        action: "UPDATE_MEMBER_COMMUNICATION_PREFERENCES",
        entityType: "Member",
        entityId: member.id,
        changes: changedFields.map((field) => ({
          field,
          oldValue: String(member[field]),
          newValue: String(next[field]),
        })),
      },
      tx,
    );

    return {
      status: "READY",
      preferences: toPreferences(next),
      unchanged: false,
    };
  });
}
