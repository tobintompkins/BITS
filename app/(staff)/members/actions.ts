"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import type { MembershipStatus } from "@/app/generated/prisma/client";
import { MembershipStatus as MembershipStatusEnum } from "@/app/generated/prisma/client";
import {
  requireMemberImportExportAccess,
} from "@/lib/auth/member-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { assertActionAllowed } from "@/lib/security/rate-limit";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";
import {
  downloadMemberCsvTemplate,
  exportMembersToCsv,
  importMembersFromCsv,
  previewMembersImport,
  recordMembersExportAudit,
} from "@/server/services/member-import-export.service";

async function getActor() {
  const userAccount = await getOrCreateUserAccount();
  const clerkUser = await currentUser();

  return {
    userAccountId: userAccount?.id ?? null,
    email:
      clerkUser?.primaryEmailAddress?.emailAddress ??
      userAccount?.primaryEmail ??
      null,
  };
}

async function getOrganizationIdOrThrow() {
  const organization = await findPrimaryOrganization();

  if (!organization) {
    throw new Error("Organization not found.");
  }

  return organization.id;
}

export async function downloadMemberCsvTemplateAction() {
  const organizationId = await getOrganizationIdOrThrow();
  await requireMemberImportExportAccess(organizationId);
  return downloadMemberCsvTemplate();
}

export async function previewMembersImportAction(csvContent: string) {
  const organizationId = await getOrganizationIdOrThrow();
  await requireMemberImportExportAccess(organizationId);
  return previewMembersImport(csvContent);
}

export async function importMembersFromCsvAction(csvContent: string) {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("You must be signed in.");
  }

  await assertActionAllowed("member.import", userId);

  const organizationId = await getOrganizationIdOrThrow();
  await requireMemberImportExportAccess(organizationId);

  const actor = await getActor();
  const result = await importMembersFromCsv(csvContent, actor);

  revalidatePath("/members");

  return result;
}

export async function exportMembersToCsvAction(filters: {
  search?: string;
  status?: string;
  householdId?: string;
}) {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("You must be signed in.");
  }

  await assertActionAllowed("member.export", userId);

  const organizationId = await getOrganizationIdOrThrow();
  await requireMemberImportExportAccess(organizationId);

  const membershipStatus = Object.values(MembershipStatusEnum).includes(
    filters.status as MembershipStatus,
  )
    ? (filters.status as MembershipStatus)
    : undefined;

  const csv = await exportMembersToCsv({
    search: filters.search,
    membershipStatus,
    householdId: filters.householdId,
  });

  const rowCount = Math.max(0, csv.split("\n").length - 1);
  const actor = await getActor();
  await recordMembersExportAudit(actor, rowCount);

  return csv;
}
