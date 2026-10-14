import { auth, currentUser } from "@clerk/nextjs/server";
import {
  RoleCode,
  StaffInvitationStatus,
  type Prisma,
} from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import {
  STAFF_INVITATION_ACCEPT_DENIED_COPY,
  STAFF_INVITATION_ACCEPT_PENDING_COPY,
  STAFF_INVITATION_ACCEPT_SUCCESS_COPY,
  normalizeStaffInvitationEmail,
  staffInvitationAcceptFormFromUnknown,
  staffInvitationAcceptSchema,
} from "@/lib/validation/staff-invitation";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import {
  getStaffInvitationProvider,
  type StaffInvitationProvider,
} from "@/server/services/staff-invitation-provider";

/**
 * Accept lock order (organization-first, compatible with Core 09):
 * 1. Organization `FOR UPDATE`
 * 2. Invitation `FOR UPDATE`
 *
 * Existing membership uniqueness is the replay guard. Provider calls happen
 * before this transaction. A locally revoked invitation cannot be granted.
 */
export const STAFF_INVITATION_ACCEPT_LOCK_ORDER = [
  "organization",
  "invitation",
] as const;

export type StaffInvitationAcceptResult =
  | {
      ok: true;
      alreadyAccepted: boolean;
      membershipId: string;
      invitationId: string;
      roleCode: RoleCode;
      message: string;
    }
  | {
      ok: false;
      code:
        | "SIGNED_OUT"
        | "INVALID"
        | "DENIED"
        | "NOT_FOUND"
        | "CONFLICT"
        | "EXISTING_MEMBER"
        | "INACTIVE_ACCOUNT";
      message: string;
    };

type InvitationLockRow = {
  id: string;
  organizationId: string;
  emailNormalized: string;
  roleCode: RoleCode;
  invitedByUserAccountId: string;
  status: StaffInvitationStatus;
  version: number;
  clerkInvitationId: string | null;
  clerkOrganizationId: string;
  expiresAt: Date;
  acceptedUserAccountId: string | null;
  reapprovedByUserAccountId: string | null;
};

type AdminDb = Prisma.TransactionClient | typeof prisma;

function fail(
  code: Extract<StaffInvitationAcceptResult, { ok: false }>["code"],
  message: string,
): Extract<StaffInvitationAcceptResult, { ok: false }> {
  return { ok: false, code, message };
}

function asDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function signedInVerifiedEmails(user: {
  primaryEmailAddress?: { emailAddress: string; verification?: { status?: string | null } | null } | null;
  emailAddresses?: Array<{
    emailAddress: string;
    verification?: { status?: string | null } | null;
  }>;
}) {
  const rows = [
    user.primaryEmailAddress,
    ...(user.emailAddresses ?? []),
  ].filter(Boolean) as Array<{
    emailAddress: string;
    verification?: { status?: string | null } | null;
  }>;
  return rows
    .filter((row) => row.verification?.status === "verified")
    .map((row) => normalizeStaffInvitationEmail(row.emailAddress));
}

async function lockOrganization(db: AdminDb, organizationId: string) {
  const rows = await db.$queryRaw<
    Array<{ id: string; clerkOrganizationId: string | null; active: boolean }>
  >`
    SELECT id, "clerkOrganizationId", active
    FROM organizations
    WHERE id = ${organizationId}::uuid
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

async function lockInvitation(
  db: AdminDb,
  invitationId: string,
): Promise<InvitationLockRow | null> {
  const rows = await db.$queryRaw<Array<InvitationLockRow>>`
    SELECT /* staff-invitation-lock:invitation */
      i.id,
      i."organizationId",
      i."emailNormalized",
      i."roleCode",
      i."invitedByUserAccountId",
      i.status,
      i.version,
      i."clerkInvitationId",
      i."clerkOrganizationId",
      i."expiresAt",
      i."acceptedUserAccountId",
      i."reapprovedByUserAccountId"
    FROM staff_invitations i
    WHERE i.id = ${invitationId}::uuid
    FOR UPDATE
  `;
  const row = rows[0];
  if (!row) return null;
  return { ...row, expiresAt: asDate(row.expiresAt) };
}

async function usableAdminExists(
  db: AdminDb,
  organizationId: string,
  userAccountId: string,
) {
  const count = await db.organizationMembership.count({
    where: {
      organizationId,
      userAccountId,
      active: true,
      roleType: { code: RoleCode.ORG_ADMIN },
      userAccount: { active: true },
    },
  });
  return count > 0;
}

async function invitationAuthorityHolds(
  db: AdminDb,
  invitation: InvitationLockRow,
) {
  if (await usableAdminExists(db, invitation.organizationId, invitation.invitedByUserAccountId)) {
    return true;
  }
  if (!invitation.reapprovedByUserAccountId) return false;
  return usableAdminExists(
    db,
    invitation.organizationId,
    invitation.reapprovedByUserAccountId,
  );
}

export async function previewStaffInvitationAcceptance(input: {
  invitationId?: string;
  provider?: StaffInvitationProvider;
}) {
  const { userId } = await auth();
  if (!userId) {
    return { status: "SIGNED_OUT" as const };
  }

  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) {
    return {
      status: "DENIED" as const,
      message: STAFF_INVITATION_ACCEPT_DENIED_COPY,
    };
  }
  if (!userAccount.active) {
    return {
      status: "DENIED" as const,
      message: "This account is disabled and cannot accept a staff invitation.",
    };
  }

  if (!input.invitationId) {
    return {
      status: "PENDING" as const,
      message: STAFF_INVITATION_ACCEPT_PENDING_COPY,
    };
  }

  if (!staffInvitationAcceptSchema.safeParse({ invitationId: input.invitationId, confirm: true }).success) {
    return { status: "DENIED" as const, message: STAFF_INVITATION_ACCEPT_DENIED_COPY };
  }

  const invitation = await prisma.staffInvitation.findUnique({
    where: { id: input.invitationId },
    include: {
      organization: {
        select: { id: true, name: true, displayName: true, active: true, clerkOrganizationId: true },
      },
    },
  });
  if (!invitation || invitation.organizationId !== invitation.organization.id) {
    return {
      status: "DENIED" as const,
      message: STAFF_INVITATION_ACCEPT_DENIED_COPY,
    };
  }

  const clerkUser = await currentUser();
  const emails = clerkUser ? signedInVerifiedEmails(clerkUser) : [];
  if (!emails.includes(invitation.emailNormalized) || !invitation.organization.active ||
      invitation.organization.clerkOrganizationId !== invitation.clerkOrganizationId ||
      invitation.status === StaffInvitationStatus.REVOKED ||
      invitation.status === StaffInvitationStatus.EXPIRED ||
      (invitation.status !== StaffInvitationStatus.ACCEPTED && invitation.expiresAt <= new Date())) {
    return { status: "DENIED" as const, message: STAFF_INVITATION_ACCEPT_DENIED_COPY };
  }

  const existing = await prisma.organizationMembership.findUnique({
    where: {
      organizationId_userAccountId: {
        organizationId: invitation.organizationId,
        userAccountId: userAccount.id,
      },
    },
    include: { roleType: { select: { code: true } } },
  });
  if (existing?.active && invitation.status === StaffInvitationStatus.ACCEPTED && invitation.acceptedUserAccountId === userAccount.id) {
    return {
      status: "ACCEPTED" as const,
      churchName: invitation.organization.displayName ?? invitation.organization.name,
      roleCode: existing.roleType.code,
      message: STAFF_INVITATION_ACCEPT_SUCCESS_COPY,
    };
  }

  return {
    status: "READY" as const,
    invitationId: invitation.id,
    churchName: invitation.organization.displayName ?? invitation.organization.name,
    roleCode: invitation.roleCode,
    email: invitation.emailDisplay,
    message: `Accept staff access for ${invitation.organization.displayName ?? invitation.organization.name} as ${invitation.roleCode}.`,
  };
}

export async function acceptStaffInvitation(
  raw: unknown,
  options: { provider?: StaffInvitationProvider } = {},
): Promise<StaffInvitationAcceptResult> {
  const parsed = staffInvitationAcceptSchema.safeParse(
    staffInvitationAcceptFormFromUnknown(raw),
  );
  if (!parsed.success) {
    return fail(
      "INVALID",
      parsed.error.issues[0]?.message ?? "Confirm acceptance before continuing.",
    );
  }

  const { userId } = await auth();
  if (!userId) {
    return fail("SIGNED_OUT", "Sign in to accept a staff invitation.");
  }

  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) {
    return fail("DENIED", STAFF_INVITATION_ACCEPT_DENIED_COPY);
  }
  if (!userAccount.active) {
    return fail(
      "INACTIVE_ACCOUNT",
      "This account is disabled and cannot accept a staff invitation.",
    );
  }

  const clerkUser = await currentUser();
  const verifiedEmails = clerkUser ? signedInVerifiedEmails(clerkUser) : [];
  if (verifiedEmails.length === 0) {
    return fail("DENIED", STAFF_INVITATION_ACCEPT_DENIED_COPY);
  }

  const preview = await prisma.staffInvitation.findUnique({
    where: { id: parsed.data.invitationId },
    select: {
      id: true,
      organizationId: true,
      emailNormalized: true,
      clerkOrganizationId: true,
      status: true,
    },
  });
  if (!preview) {
    return fail("DENIED", STAFF_INVITATION_ACCEPT_DENIED_COPY);
  }
  if (!verifiedEmails.includes(preview.emailNormalized)) {
    return fail("DENIED", STAFF_INVITATION_ACCEPT_DENIED_COPY);
  }

  const provider = options.provider ?? getStaffInvitationProvider();
  const membershipEvidence = await provider.getOrganizationMembership({
    clerkOrganizationId: preview.clerkOrganizationId,
    clerkUserId: userId,
  });
  if (!membershipEvidence.ok || !membershipEvidence.member ||
      membershipEvidence.clerkUserId !== userId ||
      membershipEvidence.clerkOrganizationId !== preview.clerkOrganizationId) {
    return fail("DENIED", STAFF_INVITATION_ACCEPT_DENIED_COPY);
  }

  try {
    return await prisma.$transaction(async (db) => {
      const organization = await lockOrganization(db, preview.organizationId);
      if (
        !organization?.active ||
        organization.clerkOrganizationId !== preview.clerkOrganizationId
      ) {
        return fail("DENIED", STAFF_INVITATION_ACCEPT_DENIED_COPY);
      }

      const invitation = await lockInvitation(db, preview.id);
      if (!invitation || invitation.organizationId !== organization.id) {
        return fail("DENIED", STAFF_INVITATION_ACCEPT_DENIED_COPY);
      }

      const existing = await db.organizationMembership.findUnique({
        where: {
          organizationId_userAccountId: {
            organizationId: invitation.organizationId,
            userAccountId: userAccount.id,
          },
        },
        include: { roleType: { select: { code: true } } },
      });

      if (
        invitation.status === StaffInvitationStatus.ACCEPTED &&
        invitation.acceptedUserAccountId === userAccount.id &&
        existing?.active
      ) {
        return {
          ok: true as const,
          alreadyAccepted: true,
          membershipId: existing.id,
          invitationId: invitation.id,
          roleCode: existing.roleType.code,
          message: STAFF_INVITATION_ACCEPT_SUCCESS_COPY,
        };
      }

      if (
        invitation.status === StaffInvitationStatus.REVOKED ||
        invitation.status === StaffInvitationStatus.EXPIRED
      ) {
        return fail("DENIED", STAFF_INVITATION_ACCEPT_DENIED_COPY);
      }
      if (!["AUTHORIZED", "SENT", "FAILED", "UNKNOWN"].includes(invitation.status)) {
        return fail("DENIED", STAFF_INVITATION_ACCEPT_DENIED_COPY);
      }
      if (invitation.expiresAt.getTime() <= Date.now()) {
        await db.staffInvitation.update({
          where: { id: invitation.id },
          data: {
            status: StaffInvitationStatus.EXPIRED,
            activeEmailKey: null,
            version: { increment: 1 },
          },
        });
        return fail("DENIED", STAFF_INVITATION_ACCEPT_DENIED_COPY);
      }
      if (invitation.emailNormalized !== preview.emailNormalized) {
        return fail("DENIED", STAFF_INVITATION_ACCEPT_DENIED_COPY);
      }
      if (!(await invitationAuthorityHolds(db, invitation))) {
        return fail("DENIED", STAFF_INVITATION_ACCEPT_DENIED_COPY);
      }
      if (existing) {
        return fail(
          "EXISTING_MEMBER",
          "This account already has a membership in this church. An administrator must use existing membership controls.",
        );
      }

      const role = await db.roleType.findUnique({
        where: { code: invitation.roleCode },
        select: { id: true, code: true },
      });
      if (!role) {
        return fail("DENIED", STAFF_INVITATION_ACCEPT_DENIED_COPY);
      }

      const created = await db.organizationMembership.create({
        data: {
          organizationId: invitation.organizationId,
          userAccountId: userAccount.id,
          roleTypeId: role.id,
          active: true,
        },
      });

      const consumed = await db.staffInvitation.updateMany({
        where: {
          id: invitation.id,
          organizationId: invitation.organizationId,
          version: invitation.version,
          status: { in: [StaffInvitationStatus.AUTHORIZED, StaffInvitationStatus.SENT, StaffInvitationStatus.FAILED, StaffInvitationStatus.UNKNOWN] },
        },
        data: {
          status: StaffInvitationStatus.ACCEPTED,
          acceptedUserAccountId: userAccount.id,
          acceptedAt: new Date(),
          activeEmailKey: null,
          version: { increment: 1 },
        },
      });
      if (consumed.count !== 1) {
        throw new Error("Invitation consumption conflict; membership creation rolled back.");
      }

      await createAuditEvent(
        {
          organizationId: invitation.organizationId,
          actorUserAccountId: userAccount.id,
          action: "STAFF_INVITATION_ACCEPTED",
          entityType: "StaffInvitation",
          entityId: invitation.id,
          changes: [
            { field: "status", oldValue: invitation.status, newValue: StaffInvitationStatus.ACCEPTED },
            { field: "membershipId", oldValue: null, newValue: created.id },
            { field: "roleCode", oldValue: null, newValue: invitation.roleCode },
          ],
        },
        db,
      );

      return {
        ok: true as const,
        alreadyAccepted: false,
        membershipId: created.id,
        invitationId: invitation.id,
        roleCode: invitation.roleCode,
        message: STAFF_INVITATION_ACCEPT_SUCCESS_COPY,
      };
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return fail(
        "EXISTING_MEMBER",
        "This account already has a membership in this church. An administrator must use existing membership controls.",
      );
    }
    throw error;
  }
}
