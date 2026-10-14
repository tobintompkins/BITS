import { RoleCode, type Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import {
  getStaffInvitationProvider,
  type StaffInvitationProvider,
} from "@/server/services/staff-invitation-provider";

export type StaffFirstAdminBootstrapInput = {
  organizationId: string;
  clerkUserId: string;
  approvalNote: string;
  apply?: boolean;
  applyAuthorized?: boolean;
  provider?: StaffInvitationProvider;
  db?: Prisma.TransactionClient | typeof prisma;
};

export type StaffFirstAdminBootstrapResult =
  | {
      ok: true;
      applied: false;
      organizationId: string;
      clerkUserId: string;
      wouldCreateUserAccount: boolean;
      wouldGrantRole: "ORG_ADMIN";
      message: string;
    }
  | {
      ok: true;
      applied: true;
      organizationId: string;
      clerkUserId: string;
      userAccountId: string;
      membershipId: string;
      message: string;
    }
  | {
      ok: false;
      code:
        | "INVALID"
        | "NO_ORGANIZATION"
        | "PROVIDER"
        | "EXISTING_ADMIN"
        | "EXISTING_MEMBER"
        | "INACTIVE_ACCOUNT"
        | "APPLY_NOT_AUTHORIZED";
      message: string;
    };

function fail(
  code: Extract<StaffFirstAdminBootstrapResult, { ok: false }>["code"],
  message: string,
): StaffFirstAdminBootstrapResult {
  return { ok: false, code, message };
}

async function lockOrganization(
  db: Prisma.TransactionClient | typeof prisma,
  organizationId: string,
) {
  const rows = await db.$queryRaw<
    Array<{
      id: string;
      name: string;
      active: boolean;
      clerkOrganizationId: string | null;
    }>
  >`
    SELECT id, name, active, "clerkOrganizationId"
    FROM organizations
    WHERE id = ${organizationId}::uuid
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

export async function previewOrApplyFirstAdminBootstrap(
  input: StaffFirstAdminBootstrapInput,
): Promise<StaffFirstAdminBootstrapResult> {
  const organizationId = input.organizationId.trim();
  const clerkUserId = input.clerkUserId.trim();
  const approvalNote = input.approvalNote.trim();
  if (!organizationId || !clerkUserId || !approvalNote) {
    return fail(
      "INVALID",
      "organization id, verified Clerk user id, and an operator approval note are required.",
    );
  }
  if (!/^user_[A-Za-z0-9]+$/.test(clerkUserId)) {
    return fail("INVALID", "Clerk user id must be an exact verified user_ identifier.");
  }

  const provider = input.provider ?? getStaffInvitationProvider();
  const identity = await provider.getUserIdentity({ clerkUserId });
  const verifiedEmails = identity.ok
    ? identity.verifiedEmails.map((email) => email.trim().toLowerCase()).filter(Boolean)
    : [];
  if (
    !identity.ok ||
    !identity.active ||
    identity.clerkUserId !== clerkUserId ||
    verifiedEmails.length === 0
  ) {
    return fail(
      "PROVIDER",
      "The Clerk user was not found or is not an active verified identity.",
    );
  }

  const mappedOrganization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, clerkOrganizationId: true, active: true },
  });
  if (!mappedOrganization?.active) {
    return fail("NO_ORGANIZATION", "That church was not found or is inactive.");
  }
  if (!mappedOrganization.clerkOrganizationId) {
    return fail(
      "NO_ORGANIZATION",
      "That church does not have a Clerk organization mapping.",
    );
  }

  const membershipEvidence = await provider.getOrganizationMembership({
    clerkOrganizationId: mappedOrganization.clerkOrganizationId,
    clerkUserId,
  });
  if (!membershipEvidence.ok || !membershipEvidence.member ||
      membershipEvidence.clerkUserId !== clerkUserId ||
      membershipEvidence.clerkOrganizationId !== mappedOrganization.clerkOrganizationId) {
    return fail(
      "PROVIDER",
      "The Clerk user is not a member of the Clerk organization mapped to this church.",
    );
  }

  const run = async (db: Prisma.TransactionClient | typeof prisma) => {
    const organization = await lockOrganization(db, organizationId);
    if (!organization?.active) {
      return fail("NO_ORGANIZATION", "That church was not found or is inactive.");
    }
    if (organization.clerkOrganizationId !== mappedOrganization.clerkOrganizationId) {
      return fail(
        "NO_ORGANIZATION",
        "That church does not have a Clerk organization mapping.",
      );
    }

    const usableAdmins = await db.organizationMembership.count({
      where: {
        organizationId: organization.id,
        active: true,
        roleType: { code: RoleCode.ORG_ADMIN },
        userAccount: { active: true },
      },
    });
    if (usableAdmins > 0) {
      return fail(
        "EXISTING_ADMIN",
        "This church already has a usable organization administrator.",
      );
    }

    const existingAccount = await db.userAccount.findUnique({
      where: { clerkUserId },
    });
    if (existingAccount && !existingAccount.active) {
      return fail(
        "INACTIVE_ACCOUNT",
        "The matching BITS account is disabled and will not be reactivated.",
      );
    }

    if (existingAccount) {
      const existingMembership = await db.organizationMembership.findUnique({
        where: {
          organizationId_userAccountId: {
            organizationId: organization.id,
            userAccountId: existingAccount.id,
          },
        },
      });
      if (existingMembership) {
        return fail(
          "EXISTING_MEMBER",
          "An existing membership for this account will not be revived or escalated.",
        );
      }
    }

    if (!input.apply) {
      return {
        ok: true as const,
        applied: false as const,
        organizationId: organization.id,
        clerkUserId,
        wouldCreateUserAccount: !existingAccount,
        wouldGrantRole: "ORG_ADMIN" as const,
        message: `Dry-run only. Would grant ORG_ADMIN on ${organization.name} to Clerk user after independent operator approval: ${approvalNote}`,
      };
    }

    if (input.applyAuthorized !== true) {
      return fail(
        "APPLY_NOT_AUTHORIZED",
        "Apply mode requires explicit operator authorization. Implementing the tool does not authorize a grant.",
      );
    }

    const role = await db.roleType.findUnique({
      where: { code: RoleCode.ORG_ADMIN },
      select: { id: true },
    });
    if (!role) {
      return fail("INVALID", "ORG_ADMIN role type is missing.");
    }

    const account =
      existingAccount ??
      (await db.userAccount.create({
        data: {
          clerkUserId,
          primaryEmail: verifiedEmails[0]!,
          displayName: null,
          active: true,
        },
      }));

    const membership = await db.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userAccountId: account.id,
        roleTypeId: role.id,
        active: true,
      },
    });

    await createAuditEvent(
      {
        organizationId: organization.id,
        actorUserAccountId: account.id,
        action: "STAFF_FIRST_ADMIN_BOOTSTRAP",
        entityType: "OrganizationMembership",
        entityId: membership.id,
        changes: [
          { field: "roleCode", oldValue: null, newValue: RoleCode.ORG_ADMIN },
          { field: "approvalNote", oldValue: null, newValue: approvalNote },
          { field: "clerkUserId", oldValue: null, newValue: clerkUserId },
        ],
      },
      db,
    );

    return {
      ok: true as const,
      applied: true as const,
      organizationId: organization.id,
      clerkUserId,
      userAccountId: account.id,
      membershipId: membership.id,
      message: "Authorized first-administrator grant completed.",
    };
  };

  if (input.db) return run(input.db);
  return prisma.$transaction((tx) => run(tx));
}
