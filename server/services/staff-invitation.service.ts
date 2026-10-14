import { auth } from "@clerk/nextjs/server";
import {
  RoleCode,
  StaffInvitationStatus,
  type Prisma,
} from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  getStaffInvitationRedirectOrigin,
  staffInvitationAcceptUrl,
} from "@/lib/staff-invitation/config";
import { formatStaffAccessDirectoryDate } from "@/lib/validation/staff-access-directory";
import {
  STAFF_INVITATION_ADMIN_CONFIRM_COPY,
  STAFF_INVITATION_CONFLICT_COPY,
  STAFF_INVITATION_DUPLICATE_COPY,
  STAFF_INVITATION_EXISTING_MEMBER_COPY,
  STAFF_INVITATION_EXPIRES_DAYS,
  STAFF_INVITATION_HISTORY_STATUSES,
  STAFF_INVITATION_NOT_FOUND_COPY,
  STAFF_INVITATION_PAGE_SIZE,
  STAFF_INVITATION_PENDING_STATUSES,
  STAFF_INVITATION_SCHEMA_COPY,
  STAFF_INVITATION_STATUS_LABELS,
  normalizeStaffInvitationEmail,
  parseStaffInvitationDirectoryQuery,
  staffInvitationCreateFormFromUnknown,
  staffInvitationCreateSchema,
  staffInvitationRetryFormFromUnknown,
  staffInvitationRetrySchema,
  staffInvitationRevokeFormFromUnknown,
  staffInvitationRevokeSchema,
  type StaffInvitationFilter,
} from "@/lib/validation/staff-invitation";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";
import {
  getStaffInvitationProvider,
  type StaffInvitationProvider,
} from "@/server/services/staff-invitation-provider";

/**
 * Lock order compatible with Core 09 organization-first serialization:
 * 1. Organization row `FOR UPDATE`
 * 2. Actor membership `FOR UPDATE` for create/retry/revoke
 * 3. Invitation row `FOR UPDATE` when an existing intent is mutated
 *
 * Provider HTTP is never performed while those locks are held.
 */
export const STAFF_INVITATION_LOCK_ORDER = [
  "organization",
  "actorMembership",
  "invitation",
] as const;

const STAFF_INVITATION_REAPPROVE_NEEDED =
  "The original inviter is no longer authorized. A current administrator must explicitly reapprove before retrying.";

export type StaffInvitationFailureCode =
  | "SIGNED_OUT"
  | "NO_ORGANIZATION"
  | "UNAUTHORIZED"
  | "INVALID"
  | "NOT_FOUND"
  | "CONFLICT"
  | "DUPLICATE"
  | "EXISTING_MEMBER"
  | "UNSUPPORTED_ROLE"
  | "SCHEMA";

export type StaffInvitationMutationResult =
  | {
      ok: true;
      invitationId: string;
      status: StaffInvitationStatus;
      version: number;
      action: string;
    }
  | { ok: false; code: StaffInvitationFailureCode; message: string };

type InvitationLockRow = {
  id: string;
  organizationId: string;
  emailNormalized: string;
  emailDisplay: string;
  roleCode: RoleCode;
  invitedByUserAccountId: string;
  status: StaffInvitationStatus;
  version: number;
  clerkInvitationId: string | null;
  clerkOrganizationId: string;
  expiresAt: Date;
  acceptedUserAccountId: string | null;
  reapprovedByUserAccountId: string | null;
  activeEmailKey: string | null;
};

type ActorLockRow = {
  id: string;
  organizationId: string;
  userAccountId: string;
  roleCode: RoleCode;
  active: boolean;
  userAccountActive: boolean;
  clerkUserId: string;
};

type AdminDb = Prisma.TransactionClient | typeof prisma;

export type StaffInvitationDirectoryRow = {
  invitationId: string;
  email: string;
  roleCode: string;
  roleLabel: string;
  status: string;
  statusLabel: string;
  version: number;
  expiresOnLabel: string;
  createdOnLabel: string;
  inviterEmail: string;
  providerBound: boolean;
  lastProviderErrorRedacted: string | null;
  needsReapproval: boolean;
  canRetry: boolean;
  canRevoke: boolean;
};

export type StaffInvitationDirectoryView =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | { status: "INVALID_FILTER" }
  | { status: "SCHEMA"; message: string }
  | {
      status: "READY";
      filter: StaffInvitationFilter;
      query: string;
      page: number;
      pageSize: number;
      total: number;
      canMutate: boolean;
      churchName: string;
      rows: StaffInvitationDirectoryRow[];
    };

function fail(
  code: StaffInvitationFailureCode,
  message: string,
): Extract<StaffInvitationMutationResult, { ok: false }> {
  return { ok: false, code, message };
}

function asDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function isPendingStatus(status: StaffInvitationStatus) {
  return (STAFF_INVITATION_PENDING_STATUSES as readonly string[]).includes(
    status,
  );
}

function isPrismaMissingTable(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2021"
  );
}

function isPrismaUnique(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

async function lockOrganization(db: AdminDb, organizationId: string) {
  const rows = await db.$queryRaw<Array<{ id: string; clerkOrganizationId: string | null; name: string }>>`
    SELECT id, "clerkOrganizationId", name
    FROM organizations
    WHERE id = ${organizationId}::uuid AND active = true
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

async function lockActorMembership(
  db: AdminDb,
  organizationId: string,
  userAccountId: string,
): Promise<ActorLockRow | null> {
  const rows = await db.$queryRaw<Array<ActorLockRow>>`
    SELECT /* staff-membership-lock:actor */
      m.id,
      m."organizationId",
      m."userAccountId",
      r.code AS "roleCode",
      m.active,
      u.active AS "userAccountActive",
      u."clerkUserId" AS "clerkUserId"
    FROM organization_memberships m
    INNER JOIN role_types r ON r.id = m."roleTypeId"
    INNER JOIN user_accounts u ON u.id = m."userAccountId"
    WHERE m."organizationId" = ${organizationId}::uuid
      AND m."userAccountId" = ${userAccountId}::uuid
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

async function lockInvitation(
  db: AdminDb,
  organizationId: string,
  invitationId: string,
): Promise<InvitationLockRow | null> {
  const rows = await db.$queryRaw<Array<InvitationLockRow>>`
    SELECT /* staff-invitation-lock:invitation */
      i.id,
      i."organizationId",
      i."emailNormalized",
      i."emailDisplay",
      i."roleCode",
      i."invitedByUserAccountId",
      i.status,
      i.version,
      i."clerkInvitationId",
      i."clerkOrganizationId",
      i."expiresAt",
      i."acceptedUserAccountId",
      i."reapprovedByUserAccountId",
      i."activeEmailKey"
    FROM staff_invitations i
    WHERE i.id = ${invitationId}::uuid
      AND i."organizationId" = ${organizationId}::uuid
    FOR UPDATE
  `;
  const row = rows[0];
  if (!row) return null;
  return { ...row, expiresAt: asDate(row.expiresAt) };
}

function isUsableAdmin(row: ActorLockRow | null) {
  return Boolean(
    row &&
      row.active &&
      row.userAccountActive &&
      row.roleCode === RoleCode.ORG_ADMIN,
  );
}

async function findExistingMemberByEmail(
  db: AdminDb,
  organizationId: string,
  emailNormalized: string,
) {
  const rows = await db.organizationMembership.findMany({
    where: { organizationId },
    select: {
      id: true,
      active: true,
      userAccount: {
        select: { id: true, primaryEmail: true, active: true },
      },
    },
  });
  return (
    rows.find(
      (row) =>
        normalizeStaffInvitationEmail(row.userAccount.primaryEmail) ===
        emailNormalized,
    ) ?? null
  );
}

async function inviterStillAuthorized(
  db: AdminDb,
  organizationId: string,
  invitation: InvitationLockRow,
) {
  const inviter = await lockActorMembership(
    db,
    organizationId,
    invitation.invitedByUserAccountId,
  );
  if (isUsableAdmin(inviter)) return true;
  if (!invitation.reapprovedByUserAccountId) return false;
  const reapprover = await lockActorMembership(
    db,
    organizationId,
    invitation.reapprovedByUserAccountId,
  );
  return isUsableAdmin(reapprover);
}

export async function resolveStaffInvitationAdminContext() {
  const { userId } = await auth();
  if (!userId) {
    return fail("SIGNED_OUT", "Sign in to manage staff invitations.");
  }

  const userAccount = await prisma.userAccount.findUnique({
    where: { clerkUserId: userId },
  });
  if (!userAccount?.active) {
    return fail(
      "UNAUTHORIZED",
      "You do not have permission to manage staff invitations.",
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

type AuthorizedIntentSuccess = {
  ok: true;
  invitationId: string;
  status: StaffInvitationStatus;
  version: number;
  action: string;
  clerkOrganizationId: string;
  churchName: string;
  inviterClerkUserId: string;
};

async function persistAuthorizedIntent(input: {
  db?: AdminDb;
  organizationId: string;
  actorUserAccountId: string;
  emailNormalized: string;
  emailDisplay: string;
  roleCode: RoleCode;
}): Promise<
  AuthorizedIntentSuccess | Extract<StaffInvitationMutationResult, { ok: false }>
> {
  const run = async (db: AdminDb) => {
    const organization = await lockOrganization(db, input.organizationId);
    if (!organization) {
      return fail(
        "NO_ORGANIZATION",
        "Select a church organization with an active staff membership.",
      );
    }
    if (!organization.clerkOrganizationId) {
      return fail(
        "INVALID",
        "This church does not have a Clerk organization mapping.",
      );
    }

    const actor = await lockActorMembership(
      db,
      input.organizationId,
      input.actorUserAccountId,
    );
    if (!isUsableAdmin(actor)) {
      return fail(
        "UNAUTHORIZED",
        "You do not have permission to manage staff invitations.",
      );
    }

    const existingMember = await findExistingMemberByEmail(
      db,
      input.organizationId,
      input.emailNormalized,
    );
    if (existingMember) {
      return fail("EXISTING_MEMBER", STAFF_INVITATION_EXISTING_MEMBER_COPY);
    }

    const expiresAt = new Date(
      Date.now() + STAFF_INVITATION_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
    );

    try {
      const created = await db.staffInvitation.create({
        data: {
          organizationId: input.organizationId,
          emailNormalized: input.emailNormalized,
          emailDisplay: input.emailDisplay,
          roleCode: input.roleCode,
          invitedByUserAccountId: input.actorUserAccountId,
          status: StaffInvitationStatus.AUTHORIZED,
          clerkOrganizationId: organization.clerkOrganizationId,
          expiresAt,
          activeEmailKey: input.emailNormalized,
        },
      });

      await createAuditEvent(
        {
          organizationId: input.organizationId,
          actorUserAccountId: input.actorUserAccountId,
          action: "STAFF_INVITATION_AUTHORIZED",
          entityType: "StaffInvitation",
          entityId: created.id,
          changes: [
            { field: "emailNormalized", oldValue: null, newValue: input.emailNormalized },
            { field: "roleCode", oldValue: null, newValue: input.roleCode },
            { field: "status", oldValue: null, newValue: StaffInvitationStatus.AUTHORIZED },
          ],
        },
        db,
      );

      return {
        ok: true as const,
        invitationId: created.id,
        status: created.status,
        version: created.version,
        action: "STAFF_INVITATION_AUTHORIZED",
        clerkOrganizationId: organization.clerkOrganizationId,
        churchName: organization.name,
        inviterClerkUserId: actor!.clerkUserId,
      };
    } catch (error) {
      if (isPrismaUnique(error)) {
        return fail("DUPLICATE", STAFF_INVITATION_DUPLICATE_COPY);
      }
      if (isPrismaMissingTable(error)) {
        return fail("SCHEMA", STAFF_INVITATION_SCHEMA_COPY);
      }
      throw error;
    }
  };

  if (input.db) return run(input.db);
  return prisma.$transaction((tx) => run(tx));
}

async function markProviderOutcome(input: {
  invitationId: string;
  organizationId: string;
  actorUserAccountId: string;
  expectedVersion: number;
  outcome: "SENT" | "FAILED" | "UNKNOWN";
  providerInvitationId?: string | null;
  redactedError?: string | null;
}) {
  try {
    return await prisma.$transaction(async (db) => {
      const organization = await lockOrganization(db, input.organizationId);
      if (!organization) {
        return fail("NO_ORGANIZATION", "The church is no longer available.");
      }
      const invitation = await lockInvitation(
        db,
        input.organizationId,
        input.invitationId,
      );
      if (!invitation) {
        return fail("NOT_FOUND", STAFF_INVITATION_NOT_FOUND_COPY);
      }
      if (
        invitation.status === StaffInvitationStatus.REVOKED ||
        invitation.status === StaffInvitationStatus.ACCEPTED ||
        invitation.status === StaffInvitationStatus.EXPIRED
      ) {
        return {
          ok: true as const,
          invitationId: invitation.id,
          status: invitation.status,
          version: invitation.version,
          action: "STAFF_INVITATION_UNCHANGED",
        };
      }
      if (invitation.version !== input.expectedVersion) {
        return fail("CONFLICT", STAFF_INVITATION_CONFLICT_COPY);
      }

      const updated = await db.staffInvitation.updateMany({
        where: {
          id: invitation.id,
          organizationId: input.organizationId,
          version: invitation.version,
        },
        data: {
          status: input.outcome,
          clerkInvitationId:
            input.providerInvitationId ?? invitation.clerkInvitationId,
          lastProviderErrorRedacted: input.redactedError ?? null,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        return fail("CONFLICT", STAFF_INVITATION_CONFLICT_COPY);
      }

      await createAuditEvent(
        {
          organizationId: input.organizationId,
          actorUserAccountId: input.actorUserAccountId,
          action: `STAFF_INVITATION_${input.outcome}`,
          entityType: "StaffInvitation",
          entityId: invitation.id,
          changes: [
            {
              field: "status",
              oldValue: invitation.status,
              newValue: input.outcome,
            },
            ...(input.redactedError
              ? [
                  {
                    field: "lastProviderErrorRedacted",
                    oldValue: null,
                    newValue: input.redactedError,
                  },
                ]
              : []),
          ],
        },
        db,
      );

      return {
        ok: true as const,
        invitationId: invitation.id,
        status: input.outcome as StaffInvitationStatus,
        version: invitation.version + 1,
        action: `STAFF_INVITATION_${input.outcome}`,
      };
    });
  } catch (error) {
    if (isPrismaMissingTable(error)) {
      return fail("SCHEMA", STAFF_INVITATION_SCHEMA_COPY);
    }
    throw error;
  }
}

async function deliverAuthorizedInvitation(input: {
  invitationId: string;
  organizationId: string;
  actorUserAccountId: string;
  emailAddress: string;
  clerkOrganizationId: string;
  inviterClerkUserId?: string;
  version: number;
  provider?: StaffInvitationProvider;
}) {
  const origin = getStaffInvitationRedirectOrigin();
  if (!origin.ok) {
    return markProviderOutcome({
      invitationId: input.invitationId,
      organizationId: input.organizationId,
      actorUserAccountId: input.actorUserAccountId,
      expectedVersion: input.version,
      outcome: "FAILED",
      redactedError: origin.message,
    });
  }

  const provider = input.provider ?? getStaffInvitationProvider();
  const delivered = await provider.createOrganizationInvitation({
    clerkOrganizationId: input.clerkOrganizationId,
    emailAddress: input.emailAddress,
    redirectUrl: staffInvitationAcceptUrl(origin.origin, input.invitationId),
    expiresInDays: STAFF_INVITATION_EXPIRES_DAYS,
    inviterClerkUserId: input.inviterClerkUserId,
    bitsInvitationId: input.invitationId,
  });

  if (!delivered.ok) {
    return markProviderOutcome({
      invitationId: input.invitationId,
      organizationId: input.organizationId,
      actorUserAccountId: input.actorUserAccountId,
      expectedVersion: input.version,
      outcome: delivered.kind === "timeout" ? "UNKNOWN" : "FAILED",
      redactedError: delivered.redactedError,
    });
  }

  return markProviderOutcome({
    invitationId: input.invitationId,
    organizationId: input.organizationId,
    actorUserAccountId: input.actorUserAccountId,
    expectedVersion: input.version,
    outcome: "SENT",
    providerInvitationId: delivered.providerInvitationId,
  });
}

export async function createStaffInvitation(
  raw: unknown,
  options: { db?: AdminDb; provider?: StaffInvitationProvider } = {},
): Promise<StaffInvitationMutationResult> {
  const context = await resolveStaffInvitationAdminContext();
  if (!("userAccount" in context)) return context;

  const parsed = staffInvitationCreateSchema.safeParse(
    staffInvitationCreateFormFromUnknown(raw),
  );
  if (!parsed.success) {
    return fail(
      "INVALID",
      parsed.error.issues[0]?.message ?? "Check the staff invitation.",
    );
  }
  if (parsed.data.roleCode === RoleCode.ORG_ADMIN && !parsed.data.confirmAdmin) {
    return fail("INVALID", STAFF_INVITATION_ADMIN_CONFIRM_COPY);
  }

  const authorized = await persistAuthorizedIntent({
    db: options.db,
    organizationId: context.organization.id,
    actorUserAccountId: context.userAccount.id,
    emailNormalized: parsed.data.email,
    emailDisplay: parsed.data.emailDisplay,
    roleCode: parsed.data.roleCode,
  });
  if (!authorized.ok) return authorized;

  return deliverAuthorizedInvitation({
    invitationId: authorized.invitationId,
    organizationId: context.organization.id,
    actorUserAccountId: context.userAccount.id,
    emailAddress: parsed.data.email,
    clerkOrganizationId: authorized.clerkOrganizationId,
    inviterClerkUserId: authorized.inviterClerkUserId,
    version: authorized.version,
    provider: options.provider,
  });
}

export async function retryStaffInvitation(
  raw: unknown,
  options: { provider?: StaffInvitationProvider } = {},
): Promise<StaffInvitationMutationResult> {
  const context = await resolveStaffInvitationAdminContext();
  if (!("userAccount" in context)) return context;

  const parsed = staffInvitationRetrySchema.safeParse(
    staffInvitationRetryFormFromUnknown(raw),
  );
  if (!parsed.success) {
    return fail(
      "INVALID",
      parsed.error.issues[0]?.message ?? "Check the invitation retry.",
    );
  }

  const prepared = await prisma.$transaction(async (db) => {
    const organization = await lockOrganization(db, context.organization.id);
    if (!organization?.clerkOrganizationId) {
      return fail(
        "NO_ORGANIZATION",
        "This church does not have a Clerk organization mapping.",
      );
    }
    const actor = await lockActorMembership(
      db,
      context.organization.id,
      context.userAccount.id,
    );
    if (!isUsableAdmin(actor)) {
      return fail(
        "UNAUTHORIZED",
        "You do not have permission to manage staff invitations.",
      );
    }
    const invitation = await lockInvitation(
      db,
      context.organization.id,
      parsed.data.invitationId,
    );
    if (!invitation) {
      return fail("NOT_FOUND", STAFF_INVITATION_NOT_FOUND_COPY);
    }
    if (invitation.version !== parsed.data.expectedVersion) {
      return fail("CONFLICT", STAFF_INVITATION_CONFLICT_COPY);
    }
    if (
      invitation.status !== StaffInvitationStatus.FAILED &&
      invitation.status !== StaffInvitationStatus.UNKNOWN &&
      invitation.status !== StaffInvitationStatus.AUTHORIZED
    ) {
      return fail(
        "INVALID",
        "Only authorized, failed, or unknown invitations can be retried.",
      );
    }
    if (invitation.expiresAt.getTime() <= Date.now()) {
      return fail("INVALID", "This invitation has expired.");
    }
    const inviterOk = await inviterStillAuthorized(
      db,
      context.organization.id,
      invitation,
    );
    if (!inviterOk && !parsed.data.reapprove) {
      return fail("UNAUTHORIZED", STAFF_INVITATION_REAPPROVE_NEEDED);
    }
    if (!inviterOk && parsed.data.reapprove) {
      await db.staffInvitation.update({
        where: { id: invitation.id },
        data: {
          reapprovedByUserAccountId: context.userAccount.id,
          reapprovedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await createAuditEvent(
        {
          organizationId: context.organization.id,
          actorUserAccountId: context.userAccount.id,
          action: "STAFF_INVITATION_REAPPROVED",
          entityType: "StaffInvitation",
          entityId: invitation.id,
          changes: [
            {
              field: "reapprovedByUserAccountId",
              oldValue: invitation.reapprovedByUserAccountId,
              newValue: context.userAccount.id,
            },
          ],
        },
        db,
      );
      invitation.version += 1;
      invitation.reapprovedByUserAccountId = context.userAccount.id;
    }

    // Claim this retry before leaving the transaction; competing requests with
    // the same submitted version cannot both send a provider request.
    const claimed = await db.staffInvitation.updateMany({
      where: { id: invitation.id, organizationId: organization.id, version: invitation.version },
      data: { version: { increment: 1 } },
    });
    if (claimed.count !== 1) throw new Error("Invitation retry claim conflict.");
    invitation.version += 1;
    return {
      ok: true as const,
      invitation,
      clerkOrganizationId: organization.clerkOrganizationId,
      inviterClerkUserId: actor!.clerkUserId,
    };
  });
  if (!prepared.ok) return prepared;

  const provider = options.provider ?? getStaffInvitationProvider();
  if (!prepared.invitation.clerkInvitationId) {
    return fail(
      "CONFLICT",
      "Delivery has no confirmed provider reference. Operator reconciliation is required before another email can be sent.",
    );
  }

  const existing = await provider.getOrganizationInvitation({
    clerkOrganizationId: prepared.clerkOrganizationId,
    providerInvitationId: prepared.invitation.clerkInvitationId,
  });
  if (existing.ok && (existing.status === "pending" || existing.status === "accepted")) {
    return markProviderOutcome({
      invitationId: prepared.invitation.id,
      organizationId: context.organization.id,
      actorUserAccountId: context.userAccount.id,
      expectedVersion: prepared.invitation.version,
      outcome: "SENT",
      providerInvitationId: existing.providerInvitationId,
    });
  }

  return markProviderOutcome({
    invitationId: prepared.invitation.id,
    organizationId: context.organization.id,
    actorUserAccountId: context.userAccount.id,
    expectedVersion: prepared.invitation.version,
    outcome: "UNKNOWN",
    redactedError: existing.ok
      ? `provider_status_${existing.status}_needs_operator_reconciliation`
      : existing.redactedError,
  });
}

export async function revokeStaffInvitation(
  raw: unknown,
  options: { provider?: StaffInvitationProvider } = {},
): Promise<StaffInvitationMutationResult> {
  const context = await resolveStaffInvitationAdminContext();
  if (!("userAccount" in context)) return context;

  const parsed = staffInvitationRevokeSchema.safeParse(
    staffInvitationRevokeFormFromUnknown(raw),
  );
  if (!parsed.success) {
    return fail(
      "INVALID",
      parsed.error.issues[0]?.message ?? "Check the invitation revocation.",
    );
  }

  const revoked = await prisma.$transaction(async (db) => {
    const organization = await lockOrganization(db, context.organization.id);
    if (!organization) {
      return fail("NO_ORGANIZATION", "The church is no longer available.");
    }
    const actor = await lockActorMembership(
      db,
      context.organization.id,
      context.userAccount.id,
    );
    if (!isUsableAdmin(actor)) {
      return fail(
        "UNAUTHORIZED",
        "You do not have permission to manage staff invitations.",
      );
    }
    const invitation = await lockInvitation(
      db,
      context.organization.id,
      parsed.data.invitationId,
    );
    if (!invitation) {
      return fail("NOT_FOUND", STAFF_INVITATION_NOT_FOUND_COPY);
    }
    if (invitation.version !== parsed.data.expectedVersion) {
      return fail("CONFLICT", STAFF_INVITATION_CONFLICT_COPY);
    }
    if (!isPendingStatus(invitation.status)) {
      return {
        ok: true as const,
        invitationId: invitation.id,
        status: invitation.status,
        version: invitation.version,
        action: "STAFF_INVITATION_UNCHANGED",
        clerkInvitationId: invitation.clerkInvitationId,
        clerkOrganizationId: invitation.clerkOrganizationId,
        requestingClerkUserId: actor!.clerkUserId,
        alreadyTerminal: true,
      };
    }

    const updated = await db.staffInvitation.updateMany({
      where: {
        id: invitation.id,
        organizationId: context.organization.id,
        version: invitation.version,
      },
      data: {
        status: StaffInvitationStatus.REVOKED,
        activeEmailKey: null,
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      return fail("CONFLICT", STAFF_INVITATION_CONFLICT_COPY);
    }

    await createAuditEvent(
      {
        organizationId: context.organization.id,
        actorUserAccountId: context.userAccount.id,
        action: "STAFF_INVITATION_REVOKED",
        entityType: "StaffInvitation",
        entityId: invitation.id,
        changes: [
          {
            field: "status",
            oldValue: invitation.status,
            newValue: StaffInvitationStatus.REVOKED,
          },
        ],
      },
      db,
    );

    return {
      ok: true as const,
      invitationId: invitation.id,
      status: StaffInvitationStatus.REVOKED,
      version: invitation.version + 1,
      action: "STAFF_INVITATION_REVOKED",
      clerkInvitationId: invitation.clerkInvitationId,
      clerkOrganizationId: invitation.clerkOrganizationId,
      requestingClerkUserId: actor!.clerkUserId,
      alreadyTerminal: false,
    };
  });
  if (!revoked.ok) return revoked;

  if (revoked.alreadyTerminal || !revoked.clerkInvitationId) {
    return {
      ok: true,
      invitationId: revoked.invitationId,
      status: revoked.status,
      version: revoked.version,
      action: revoked.action,
    };
  }

  const provider = options.provider ?? getStaffInvitationProvider();
  const remote = await provider.revokeOrganizationInvitation({
    clerkOrganizationId: revoked.clerkOrganizationId,
    providerInvitationId: revoked.clerkInvitationId,
    requestingClerkUserId: revoked.requestingClerkUserId,
  });
  if (!remote.ok) {
    await prisma.staffInvitation.update({
      where: { id: revoked.invitationId },
      data: {
        lastProviderErrorRedacted: remote.redactedError,
      },
    });
  }

  return {
    ok: true,
    invitationId: revoked.invitationId,
    status: revoked.status,
    version: revoked.version,
    action: revoked.action,
  };
}

export async function getStaffInvitationDirectory(
  input: unknown = {},
): Promise<StaffInvitationDirectoryView> {
  const context = await resolveStaffInvitationAdminContext();
  if (!context.ok) {
    if (context.code === "SIGNED_OUT") return { status: "SIGNED_OUT" };
    if (context.code === "NO_ORGANIZATION") return { status: "NO_ORGANIZATION" };
    return { status: "UNAUTHORIZED" };
  }

  const accessActor = await prisma.organizationMembership.findFirst({
    where: {
      organizationId: context.organization.id,
      userAccountId: context.userAccount.id,
      active: true,
      roleType: { code: RoleCode.ORG_ADMIN },
      userAccount: { active: true },
    },
    select: { id: true },
  });
  const canMutate = Boolean(accessActor);
  if (!canMutate) {
    const { getOrganizationAccess } = await import("@/lib/auth/permissions");
    const access = await getOrganizationAccess(context.organization.id);
    if (!access.canEdit) return { status: "UNAUTHORIZED" };
  }

  const parsed = parseStaffInvitationDirectoryQuery(input);
  if (!parsed.success) return { status: "INVALID_FILTER" };

  const statuses =
    parsed.data.filter === "HISTORY"
      ? [...STAFF_INVITATION_HISTORY_STATUSES]
      : [...STAFF_INVITATION_PENDING_STATUSES];

  try {
    const where = {
      organizationId: context.organization.id,
      status: { in: statuses as StaffInvitationStatus[] },
      ...(parsed.data.query
        ? {
            emailNormalized: {
              contains: normalizeStaffInvitationEmail(parsed.data.query),
              mode: "insensitive" as const,
            },
          }
        : {}),
    };
    const [total, records] = await Promise.all([
      prisma.staffInvitation.count({ where }),
      prisma.staffInvitation.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (parsed.data.page - 1) * STAFF_INVITATION_PAGE_SIZE,
        take: STAFF_INVITATION_PAGE_SIZE,
        select: {
          id: true,
          emailDisplay: true,
          roleCode: true,
          status: true,
          version: true,
          expiresAt: true,
          createdAt: true,
          clerkInvitationId: true,
          lastProviderErrorRedacted: true,
          invitedBy: { select: { primaryEmail: true, active: true } },
          invitedByUserAccountId: true,
          reapprovedByUserAccountId: true,
        },
      }),
    ]);

    const inviterIds = [
      ...new Set(records.map((row) => row.invitedByUserAccountId)),
    ];
    const usableInviters = inviterIds.length
      ? await prisma.organizationMembership.findMany({
          where: {
            organizationId: context.organization.id,
            userAccountId: { in: inviterIds },
            active: true,
            roleType: { code: RoleCode.ORG_ADMIN },
            userAccount: { active: true },
          },
          select: { userAccountId: true },
        })
      : [];
    const usableInviterIds = new Set(
      usableInviters.map((row) => row.userAccountId),
    );

    return {
      status: "READY",
      filter: parsed.data.filter,
      query: parsed.data.query,
      page: parsed.data.page,
      pageSize: STAFF_INVITATION_PAGE_SIZE,
      total,
      canMutate,
      churchName: context.organization.displayName ?? context.organization.name,
      rows: records.map((row) => {
        const inviterAuthorized =
          usableInviterIds.has(row.invitedByUserAccountId) ||
          Boolean(row.reapprovedByUserAccountId);
        const pending = isPendingStatus(row.status);
        return {
          invitationId: row.id,
          email: row.emailDisplay,
          roleCode: row.roleCode,
          roleLabel: row.roleCode,
          status: row.status,
          statusLabel: STAFF_INVITATION_STATUS_LABELS[row.status] ?? row.status,
          version: row.version,
          expiresOnLabel: formatStaffAccessDirectoryDate(row.expiresAt),
          createdOnLabel: formatStaffAccessDirectoryDate(row.createdAt),
          inviterEmail: row.invitedBy.primaryEmail,
          providerBound: Boolean(row.clerkInvitationId),
          lastProviderErrorRedacted: row.lastProviderErrorRedacted,
          needsReapproval: pending && !inviterAuthorized,
          canRetry:
            canMutate &&
            (row.status === StaffInvitationStatus.FAILED ||
              row.status === StaffInvitationStatus.UNKNOWN ||
              row.status === StaffInvitationStatus.AUTHORIZED),
          canRevoke: canMutate && pending,
        };
      }),
    };
  } catch (error) {
    if (isPrismaMissingTable(error)) {
      return { status: "SCHEMA", message: STAFF_INVITATION_SCHEMA_COPY };
    }
    throw error;
  }
}
