import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export const portalStatementPdfModeSchema = z.enum(["view", "download"]);
export const portalStatementIdSchema = z.string().uuid();

export type PortalStatementPdfMode = z.infer<typeof portalStatementPdfModeSchema>;

/**
 * Ownership-scoped lookup for an individual published statement.
 * Tenant, connected donor, active donor, type, and status are all required.
 * A known UUID alone is never enough.
 */
export function portalPublishedIndividualStatementWhere(input: {
  organizationId: string;
  donorId: string;
  statementId: string;
}) {
  return {
    id: input.statementId,
    organizationId: input.organizationId,
    donorId: input.donorId,
    householdId: null,
    statementType: "INDIVIDUAL" as const,
    status: "PUBLISHED" as const,
  };
}

export type AuthorizedPortalStatementPdf =
  | { status: "SIGNED_OUT" }
  | { status: "INVALID_REQUEST" }
  | { status: "NOT_AVAILABLE" }
  | {
      status: "AUTHORIZED";
      organizationId: string;
      statementId: string;
      userAccountId: string;
      statementIdentifier: string;
      pdfStorageKey: string;
      pdfChecksum: string | null;
      mode: PortalStatementPdfMode;
    };

export async function authorizePortalStatementPdf(
  statementId: string,
  modeRaw: string,
): Promise<AuthorizedPortalStatementPdf> {
  const modeParsed = portalStatementPdfModeSchema.safeParse(modeRaw);
  const idParsed = portalStatementIdSchema.safeParse(statementId);
  if (!modeParsed.success || !idParsed.success) {
    return { status: "INVALID_REQUEST" };
  }

  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) {
    return { status: "SIGNED_OUT" };
  }

  const organization = await findPrimaryOrganization();
  if (!organization) {
    return { status: "NOT_AVAILABLE" };
  }

  const donor = await prisma.donor.findFirst({
    where: {
      organizationId: organization.id,
      userAccountId: userAccount.id,
      active: true,
    },
    select: { id: true },
  });
  if (!donor) {
    return { status: "NOT_AVAILABLE" };
  }

  const statement = await prisma.contributionStatement.findFirst({
    where: portalPublishedIndividualStatementWhere({
      organizationId: organization.id,
      donorId: donor.id,
      statementId: idParsed.data,
    }),
    select: {
      id: true,
      organizationId: true,
      statementIdentifier: true,
      pdfStorageKey: true,
      pdfChecksum: true,
    },
  });

  if (!statement?.pdfStorageKey) {
    return { status: "NOT_AVAILABLE" };
  }

  return {
    status: "AUTHORIZED",
    organizationId: statement.organizationId,
    statementId: statement.id,
    userAccountId: userAccount.id,
    statementIdentifier: statement.statementIdentifier,
    pdfStorageKey: statement.pdfStorageKey,
    pdfChecksum: statement.pdfChecksum,
    mode: modeParsed.data,
  };
}

export async function recordPortalStatementAccess(input: {
  organizationId: string;
  statementId: string;
  userAccountId: string;
  mode: PortalStatementPdfMode;
}) {
  await prisma.statementAccessEvent.create({
    data: {
      organizationId: input.organizationId,
      statementId: input.statementId,
      userAccountId: input.userAccountId,
      action: input.mode === "view" ? "VIEWED" : "DOWNLOADED",
    },
  });
}
