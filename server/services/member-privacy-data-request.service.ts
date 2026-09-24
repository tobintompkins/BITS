import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { getPrivacyRequestAccess } from "@/lib/auth/privacy-request-permissions";
import { prisma } from "@/lib/db/prisma";
import {
  memberPrivacyRequestOpenStatuses,
  submitMemberPrivacyDataRequestSchema,
  updateStaffPrivacyDataRequestSchema,
} from "@/lib/validation/member-privacy-data-request";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

const memberHistorySelect = {
  requestType: true,
  status: true,
  createdAt: true,
  staffResolutionNote: true,
} as const;

const staffQueueSelect = {
  id: true,
  requestType: true,
  status: true,
  memberNote: true,
  staffResolutionNote: true,
  createdAt: true,
  resolvedAt: true,
  requestingUser: {
    select: {
      displayName: true,
      primaryEmail: true,
    },
  },
  linkedDonor: {
    select: {
      firstName: true,
      lastName: true,
    },
  },
} as const;

function auditStatusChanges(input: {
  action: string;
  requestType: string;
  previousStatus?: string | null;
  nextStatus: string;
}) {
  return [
    { field: "action", oldValue: null, newValue: input.action },
    { field: "requestType", oldValue: null, newValue: input.requestType },
    {
      field: "status",
      oldValue: input.previousStatus ?? null,
      newValue: input.nextStatus,
    },
  ];
}

export async function getMemberPrivacyDataRequests() {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" as const };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" as const };

  const requests = await prisma.memberPrivacyDataRequest.findMany({
    where: {
      organizationId: organization.id,
      requestingUserAccountId: userAccount.id,
    },
    select: memberHistorySelect,
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return {
    status: "READY" as const,
    requests,
  };
}

export async function submitMemberPrivacyDataRequest(input: unknown) {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" as const };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" as const };

  const parsed = submitMemberPrivacyDataRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "INVALID" as const,
      message:
        parsed.error.issues[0]?.message ?? "Please choose a valid request type.",
    };
  }

  const duplicate = await prisma.memberPrivacyDataRequest.findFirst({
    where: {
      organizationId: organization.id,
      requestingUserAccountId: userAccount.id,
      requestType: parsed.data.requestType,
      status: { in: [...memberPrivacyRequestOpenStatuses] },
    },
    select: { id: true },
  });
  if (duplicate) {
    return { status: "DUPLICATE" as const };
  }

  const donor = await prisma.donor.findFirst({
    where: {
      organizationId: organization.id,
      userAccountId: userAccount.id,
      active: true,
    },
    select: { id: true },
  });

  const created = await prisma.memberPrivacyDataRequest.create({
    data: {
      organizationId: organization.id,
      requestingUserAccountId: userAccount.id,
      linkedDonorId: donor?.id ?? null,
      requestType: parsed.data.requestType,
      memberNote: parsed.data.memberNote ?? null,
      status: "OPEN",
    },
    select: { id: true, requestType: true, status: true },
  });

  await createAuditEvent({
    organizationId: organization.id,
    actorUserAccountId: userAccount.id,
    action: "SUBMIT_PRIVACY_DATA_REQUEST",
    entityType: "MemberPrivacyDataRequest",
    entityId: created.id,
    changes: auditStatusChanges({
      action: "SUBMIT_PRIVACY_DATA_REQUEST",
      requestType: created.requestType,
      previousStatus: null,
      nextStatus: created.status,
    }),
  });

  return { status: "CREATED" as const };
}

export async function listStaffPrivacyDataRequests() {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" as const };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" as const };

  const access = await getPrivacyRequestAccess(organization.id);
  if (!access.canReviewPrivacyRequests) {
    return { status: "FORBIDDEN" as const };
  }

  const requests = await prisma.memberPrivacyDataRequest.findMany({
    where: { organizationId: organization.id },
    select: staffQueueSelect,
    orderBy: [{ createdAt: "desc" }],
    take: 100,
  });

  return {
    status: "READY" as const,
    requests,
  };
}

export async function updateStaffPrivacyDataRequestStatus(input: unknown) {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" as const };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" as const };

  const access = await getPrivacyRequestAccess(organization.id);
  if (!access.canReviewPrivacyRequests) {
    return { status: "FORBIDDEN" as const };
  }

  const parsed = updateStaffPrivacyDataRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "INVALID" as const,
      message:
        parsed.error.issues[0]?.message ?? "Please choose a valid review status.",
    };
  }

  const existing = await prisma.memberPrivacyDataRequest.findFirst({
    where: {
      id: parsed.data.requestId,
      organizationId: organization.id,
    },
    select: { id: true, requestType: true, status: true },
  });
  if (!existing) return { status: "NOT_FOUND" as const };

  const resolved = parsed.data.status === "IN_REVIEW"
    ? { resolvedAt: null, resolvedByUserAccountId: null }
    : {
        resolvedAt: new Date(),
        resolvedByUserAccountId: userAccount.id,
      };

  await prisma.memberPrivacyDataRequest.update({
    where: { id: existing.id },
    data: {
      status: parsed.data.status,
      staffResolutionNote: parsed.data.staffResolutionNote ?? null,
      ...resolved,
    },
  });

  await createAuditEvent({
    organizationId: organization.id,
    actorUserAccountId: userAccount.id,
    action: "UPDATE_PRIVACY_DATA_REQUEST_STATUS",
    entityType: "MemberPrivacyDataRequest",
    entityId: existing.id,
    changes: auditStatusChanges({
      action: "UPDATE_PRIVACY_DATA_REQUEST_STATUS",
      requestType: existing.requestType,
      previousStatus: existing.status,
      nextStatus: parsed.data.status,
    }),
  });

  return { status: "UPDATED" as const };
}
