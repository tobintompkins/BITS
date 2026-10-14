import { auth } from "@clerk/nextjs/server";
import { RoleCode, type Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  STAFF_ACCESS_DIRECTORY_ROLE_CODES,
  isStaffAccessDirectoryRoleCode,
} from "@/lib/validation/staff-access-directory";
import {
  STAFF_MEMBERSHIP_CONFLICT_COPY,
  STAFF_MEMBERSHIP_INACTIVE_ACCOUNT_COPY,
  STAFF_MEMBERSHIP_LAST_ADMIN_COPY,
  STAFF_MEMBERSHIP_NOT_FOUND_COPY,
  STAFF_MEMBERSHIP_SELF_COPY,
  STAFF_MEMBERSHIP_UNSUPPORTED_COPY,
  staffMembershipFormFromUnknown,
  staffMembershipUpdateSchema,
  type StaffMembershipUpdateInput,
} from "@/lib/validation/staff-membership-admin";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

/**
 * Deterministic lock order for existing-membership edits in one church:
 * 1. Organization row `FOR UPDATE` (church-scoped serialization)
 * 2. Actor membership `FOR UPDATE` (organizationId + userAccountId)
 * 3. Target membership `FOR UPDATE` (id + organizationId) when different
 * Actor authorization is rechecked after those locks. Last-admin counts only
 * usable active ORG_ADMIN memberships whose UserAccount is also active.
 *
 * This endpoint does not serialize UserAccount.active, Organization.active,
 * seed/fixture writes, or first-organization bootstrap. Those remain
 * uncovered concurrency paths. There is no application permission cache;
 * the next protected server query re-reads active memberships.
 */
export const STAFF_MEMBERSHIP_ADMIN_LOCK_ORDER = [
  "organization",
  "actorMembership",
  "targetMembership",
] as const;

export type StaffMembershipAdminFailureCode =
  | "SIGNED_OUT"
  | "NO_ORGANIZATION"
  | "UNAUTHORIZED"
  | "INVALID"
  | "NOT_FOUND"
  | "CONFLICT"
  | "SELF"
  | "LAST_ADMIN"
  | "INACTIVE_ACCOUNT"
  | "UNSUPPORTED_ROLE";

export type StaffMembershipAdminResult =
  | { ok: true; changed: false; membershipId: string; version: number }
  | {
      ok: true;
      changed: true;
      membershipId: string;
      version: number;
      action: string;
    }
  | {
      ok: false;
      code: StaffMembershipAdminFailureCode;
      message: string;
    };

type MembershipLockRow = {
  id: string;
  organizationId: string;
  userAccountId: string;
  roleTypeId: string;
  active: boolean;
  version: number;
  updatedAt: Date;
  roleCode: RoleCode;
  userAccountActive: boolean;
};

type AdminDb = Prisma.TransactionClient | typeof prisma;

function fail(
  code: StaffMembershipAdminFailureCode,
  message: string,
): StaffMembershipAdminResult {
  return { ok: false, code, message };
}

function asDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

async function lockOrganization(db: AdminDb, organizationId: string) {
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM organizations
    WHERE id = ${organizationId}::uuid AND active = true
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

async function lockMembership(
  db: AdminDb,
  organizationId: string,
  where:
    | { userAccountId: string }
    | { membershipId: string },
): Promise<MembershipLockRow | null> {
  const rows =
    "userAccountId" in where
      ? await db.$queryRaw<Array<MembershipLockRow>>`
          SELECT /* staff-membership-lock:actor */
            m.id,
            m."organizationId",
            m."userAccountId",
            m."roleTypeId",
            m.active,
            m.version,
            m."updatedAt",
            r.code AS "roleCode",
            u.active AS "userAccountActive"
          FROM organization_memberships m
          INNER JOIN role_types r ON r.id = m."roleTypeId"
          INNER JOIN user_accounts u ON u.id = m."userAccountId"
          WHERE m."organizationId" = ${organizationId}::uuid
            AND m."userAccountId" = ${where.userAccountId}::uuid
          FOR UPDATE
        `
      : await db.$queryRaw<Array<MembershipLockRow>>`
          SELECT /* staff-membership-lock:target */
            m.id,
            m."organizationId",
            m."userAccountId",
            m."roleTypeId",
            m.active,
            m.version,
            m."updatedAt",
            r.code AS "roleCode",
            u.active AS "userAccountActive"
          FROM organization_memberships m
          INNER JOIN role_types r ON r.id = m."roleTypeId"
          INNER JOIN user_accounts u ON u.id = m."userAccountId"
          WHERE m.id = ${where.membershipId}::uuid
            AND m."organizationId" = ${organizationId}::uuid
          FOR UPDATE
        `;
  const row = rows[0];
  if (!row) return null;
  return { ...row, updatedAt: asDate(row.updatedAt) };
}

async function countUsableAdmins(db: AdminDb, organizationId: string) {
  return db.organizationMembership.count({
    where: {
      organizationId,
      active: true,
      roleType: { code: RoleCode.ORG_ADMIN },
      userAccount: { active: true },
    },
  });
}

function isUsableAdmin(row: MembershipLockRow) {
  return (
    row.active &&
    row.userAccountActive &&
    row.roleCode === RoleCode.ORG_ADMIN
  );
}

function auditAction(before: MembershipLockRow, next: StaffMembershipUpdateInput) {
  const roleChanged = before.roleCode !== next.roleCode;
  const statusChanged = before.active !== next.active;
  if (statusChanged && roleChanged) return "STAFF_MEMBERSHIP_UPDATED";
  if (statusChanged) {
    return next.active
      ? "STAFF_MEMBERSHIP_REACTIVATED"
      : "STAFF_MEMBERSHIP_DEACTIVATED";
  }
  return "STAFF_MEMBERSHIP_ROLE_CHANGED";
}

export async function resolveStaffMembershipAdminContext() {
  const { userId } = await auth();
  if (!userId) {
    return fail("SIGNED_OUT", "Sign in to manage staff memberships.");
  }

  const userAccount = await prisma.userAccount.findUnique({
    where: { clerkUserId: userId },
  });
  if (!userAccount?.active) {
    return fail(
      "UNAUTHORIZED",
      "You do not have permission to change staff memberships.",
    );
  }

  const organization = await findPrimaryOrganization();
  if (!organization) {
    return fail(
      "NO_ORGANIZATION",
      "Select a church organization with an active staff membership.",
    );
  }

  return {
    ok: true as const,
    userAccount,
    organization,
  };
}

export async function applyStaffMembershipChange(input: {
  db?: AdminDb;
  organizationId: string;
  actorUserAccountId: string;
  update: StaffMembershipUpdateInput;
}): Promise<StaffMembershipAdminResult> {
  const run = async (db: Prisma.TransactionClient | typeof prisma) => {
    const organization = await lockOrganization(db, input.organizationId);
    if (!organization) {
      return fail(
        "NO_ORGANIZATION",
        "Select a church organization with an active staff membership.",
      );
    }

    const actor = await lockMembership(db, input.organizationId, {
      userAccountId: input.actorUserAccountId,
    });
    if (
      !actor ||
      !actor.active ||
      !actor.userAccountActive ||
      actor.roleCode !== RoleCode.ORG_ADMIN
    ) {
      return fail(
        "UNAUTHORIZED",
        "You do not have permission to change staff memberships.",
      );
    }

    const target =
      actor.id === input.update.membershipId
        ? actor
        : await lockMembership(db, input.organizationId, {
            membershipId: input.update.membershipId,
          });
    if (!target) {
      return fail("NOT_FOUND", STAFF_MEMBERSHIP_NOT_FOUND_COPY);
    }

    if (target.userAccountId === actor.userAccountId) {
      return fail("SELF", STAFF_MEMBERSHIP_SELF_COPY);
    }

    if (!isStaffAccessDirectoryRoleCode(target.roleCode)) {
      return fail("UNSUPPORTED_ROLE", STAFF_MEMBERSHIP_UNSUPPORTED_COPY);
    }

    if (
      target.roleCode === input.update.roleCode &&
      target.active === input.update.active
    ) {
      return {
        ok: true as const,
        changed: false as const,
        membershipId: target.id,
        version: target.version,
      };
    }

    if (
      target.version !== input.update.expectedVersion ||
      target.updatedAt.toISOString() !== input.update.expectedUpdatedAt
    ) {
      return fail("CONFLICT", STAFF_MEMBERSHIP_CONFLICT_COPY);
    }

    if (!target.active && input.update.active && !target.userAccountActive) {
      return fail("INACTIVE_ACCOUNT", STAFF_MEMBERSHIP_INACTIVE_ACCOUNT_COPY);
    }

    const wouldRemainUsableAdmin =
      input.update.active &&
      target.userAccountActive &&
      input.update.roleCode === RoleCode.ORG_ADMIN;
    if (isUsableAdmin(target) && !wouldRemainUsableAdmin) {
      const usableAdmins = await countUsableAdmins(db, input.organizationId);
      if (usableAdmins <= 1) {
        return fail("LAST_ADMIN", STAFF_MEMBERSHIP_LAST_ADMIN_COPY);
      }
    }

    const nextRole = await db.roleType.findUnique({
      where: { code: input.update.roleCode },
      select: { id: true, code: true },
    });
    if (!nextRole) {
      return fail("INVALID", "That staff role is not available.");
    }

    const updated = await db.organizationMembership.updateMany({
      where: {
        id: target.id,
        organizationId: input.organizationId,
        version: target.version,
        updatedAt: target.updatedAt,
      },
      data: {
        roleTypeId: nextRole.id,
        active: input.update.active,
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      return fail("CONFLICT", STAFF_MEMBERSHIP_CONFLICT_COPY);
    }

    const action = auditAction(target, input.update);
    await createAuditEvent(
      {
        organizationId: input.organizationId,
        actorUserAccountId: actor.userAccountId,
        action,
        entityType: "OrganizationMembership",
        entityId: target.id,
        changes: [
          ...(target.roleCode !== input.update.roleCode
            ? [
                {
                  field: "roleCode",
                  oldValue: target.roleCode,
                  newValue: input.update.roleCode,
                },
              ]
            : []),
          ...(target.active !== input.update.active
            ? [
                {
                  field: "active",
                  oldValue: target.active ? "true" : "false",
                  newValue: input.update.active ? "true" : "false",
                },
              ]
            : []),
        ],
      },
      db,
    );

    return {
      ok: true as const,
      changed: true as const,
      membershipId: target.id,
      version: target.version + 1,
      action,
    };
  };

  if (input.db) return run(input.db);
  return prisma.$transaction((tx) => run(tx));
}

export async function updateStaffMembership(
  raw: unknown,
): Promise<StaffMembershipAdminResult> {
  const context = await resolveStaffMembershipAdminContext();
  if (!("userAccount" in context)) return context;

  const parsed = staffMembershipUpdateSchema.safeParse(
    staffMembershipFormFromUnknown(raw),
  );
  if (!parsed.success) {
    return fail(
      "INVALID",
      parsed.error.issues[0]?.message ?? "Check the staff membership change.",
    );
  }

  if (
    !(STAFF_ACCESS_DIRECTORY_ROLE_CODES as readonly string[]).includes(
      parsed.data.roleCode,
    )
  ) {
    return fail("UNSUPPORTED_ROLE", STAFF_MEMBERSHIP_UNSUPPORTED_COPY);
  }

  return applyStaffMembershipChange({
    organizationId: context.organization.id,
    actorUserAccountId: context.userAccount.id,
    update: parsed.data,
  });
}
