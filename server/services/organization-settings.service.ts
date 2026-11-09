import { AsyncLocalStorage } from "node:async_hooks";

import { auth } from "@clerk/nextjs/server";
import { RoleCode, type Organization } from "@/app/generated/prisma/client";
import { lockOrganizationForLedger } from "@/lib/batches/ledger-locks";
import {
  notifyGivingHouseholdLocksAcquired,
  notifyGivingHouseholdTransactionStarted,
} from "@/server/services/giving-household-runtime";
import {
  getLogoPublicUrl,
  removeOrganizationLogoFile,
  saveOrganizationLogo,
} from "@/lib/storage/organization-logo";
import {
  buildOrganizationAuditChanges,
  toOrganizationSettingsFormValues,
  type OrganizationSettingsFormValues,
  type OrganizationSettingsInput,
} from "@/lib/validation/organization-settings";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { requireOrganizationEditAccess } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import {
  findPrimaryOrganization,
  updateOrganization,
  type OrganizationWriteInput,
} from "@/server/repositories/organization.repository";

type OrganizationSettingsSeams = {
  failAudit?: boolean;
  failPredecessorCleanup?: boolean;
  afterLock?: (info: {
    organizationId: string;
    predecessorKey: string | null;
  }) => Promise<void> | void;
};

const seamStore = new AsyncLocalStorage<OrganizationSettingsSeams>();

export function runWithOrganizationSettingsSeams<T>(
  seams: OrganizationSettingsSeams,
  fn: () => Promise<T>,
) {
  return seamStore.run({ ...seamStore.getStore(), ...seams }, fn);
}

export class OrganizationSettingsError extends Error {}

export type SavedOrganizationSettings = {
  organization: Organization;
  cleanupNotice: string | null;
};

type SaveOrganizationSettingsOptions = {
  logoFile?: File | null;
  removeLogo?: boolean;
};

function mapInputToPersistence(
  input: OrganizationSettingsInput,
): Omit<OrganizationWriteInput, "slug"> {
  return {
    name: input.churchName,
    displayName: input.displayName,
    ein: input.ein ?? null,
    mailingAddressLine1: input.addressLine1,
    mailingAddressLine2: input.addressLine2 ?? null,
    city: input.city,
    state: input.state,
    postalCode: input.zipCode,
    country: input.country,
    contactPhone: input.phone ?? null,
    contactEmail: input.email,
    websiteUrl: input.website ?? null,
    statementFooterText: input.statementFooter ?? null,
    timeZone: input.timeZone,
  };
}

function samePersistedSettings(
  row: Organization,
  data: Omit<OrganizationWriteInput, "slug">,
  logoStorageKey: string | null,
) {
  return (
    row.name === data.name &&
    (row.displayName ?? "") === (data.displayName ?? "") &&
    (row.ein ?? null) === (data.ein ?? null) &&
    row.mailingAddressLine1 === data.mailingAddressLine1 &&
    (row.mailingAddressLine2 ?? null) === (data.mailingAddressLine2 ?? null) &&
    row.city === data.city &&
    row.state === data.state &&
    row.postalCode === data.postalCode &&
    row.country === data.country &&
    (row.contactPhone ?? null) === (data.contactPhone ?? null) &&
    (row.contactEmail ?? null) === (data.contactEmail ?? null) &&
    (row.websiteUrl ?? null) === (data.websiteUrl ?? null) &&
    (row.statementFooterText ?? null) === (data.statementFooterText ?? null) &&
    row.timeZone === data.timeZone &&
    (row.logoStorageKey ?? null) === logoStorageKey
  );
}

function auditValues(row: Organization): OrganizationSettingsFormValues {
  return {
    ...toOrganizationSettingsFormValues(row),
    logoUrl: getLogoPublicUrl(row.logoStorageKey) ?? "",
  };
}

function reportLogoLeftover(code: string, organizationId: string, storageKey: string) {
  console.error(
    `[organization-settings] ${code} organizationId=${organizationId} storageKey=${storageKey}`,
  );
}

async function discardStagedLogo(organizationId: string, stagedKey: string) {
  let committed: boolean | null = null;
  try {
    const current = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { logoStorageKey: true },
    });
    committed = current?.logoStorageKey === stagedKey;
  } catch {
    committed = null;
  }
  if (committed !== false) {
    reportLogoLeftover(
      "organization-logo-staged-file-retained",
      organizationId,
      stagedKey,
    );
    return committed === true;
  }
  try {
    await removeOrganizationLogoFile(organizationId, stagedKey);
  } catch {
    reportLogoLeftover(
      "organization-logo-staged-file-retained",
      organizationId,
      stagedKey,
    );
  }
  return false;
}

async function cleanupPredecessor(input: {
  organizationId: string;
  predecessorKey: string | null;
  committedKey: string | null;
}) {
  if (!input.predecessorKey || input.predecessorKey === input.committedKey) {
    return null;
  }
  let currentKey: string | null | undefined;
  try {
    const current = await prisma.organization.findUnique({
      where: { id: input.organizationId },
      select: { logoStorageKey: true },
    });
    currentKey = current?.logoStorageKey ?? null;
  } catch {
    reportLogoLeftover(
      "organization-logo-predecessor-retained",
      input.organizationId,
      input.predecessorKey,
    );
    return "Settings saved. The previous logo file is still stored.";
  }
  if (currentKey !== input.committedKey) {
    reportLogoLeftover(
      "organization-logo-predecessor-retained",
      input.organizationId,
      input.predecessorKey,
    );
    return "Settings saved. The previous logo file is still stored.";
  }
  try {
    if (seamStore.getStore()?.failPredecessorCleanup) {
      throw new Error("Injected organization logo cleanup failure");
    }
    await removeOrganizationLogoFile(input.organizationId, input.predecessorKey);
  } catch {
    reportLogoLeftover(
      "organization-logo-predecessor-retained",
      input.organizationId,
      input.predecessorKey,
    );
    return "Settings saved. The previous logo file is still stored.";
  }
  return null;
}

export async function getOrganizationSettingsValues(): Promise<OrganizationSettingsFormValues> {
  const organization = await findPrimaryOrganization();

  if (!organization) {
    return toOrganizationSettingsFormValues(null);
  }

  const values = toOrganizationSettingsFormValues(organization);

  return {
    ...values,
    logoUrl: getLogoPublicUrl(organization.logoStorageKey) ?? "",
  };
}

export async function saveOrganizationSettings(
  input: OrganizationSettingsInput,
  options: SaveOrganizationSettingsOptions = {},
): Promise<SavedOrganizationSettings> {
  const { userId } = await auth();
  if (!userId) {
    throw new OrganizationSettingsError(
      "You must be signed in to update organization settings.",
    );
  }

  const organization = await findPrimaryOrganization();
  if (!organization) {
    throw new OrganizationSettingsError(
      "Select a church organization before editing settings.",
    );
  }

  const access = await requireOrganizationEditAccess(organization.id);
  const actor = await getOrCreateUserAccount();
  if (!access.isSuperAdmin && !actor) {
    throw new OrganizationSettingsError(
      "You do not have permission to edit organization settings.",
    );
  }

  const logoFile =
    options.logoFile && options.logoFile.size > 0 && !options.removeLogo
      ? options.logoFile
      : null;
  const staged = logoFile
    ? await saveOrganizationLogo(organization.id, logoFile)
    : null;

  const data = mapInputToPersistence(input);
  try {
    const saved = await prisma.$transaction(async (tx) => {
      await notifyGivingHouseholdTransactionStarted(tx);
      const locked = await lockOrganizationForLedger(tx, organization.id);
      if (!locked) {
        throw new OrganizationSettingsError(
          "Organization settings are not available for this church.",
        );
      }
      if (!access.isSuperAdmin) {
        const membership = await tx.organizationMembership.findFirst({
          where: {
            organizationId: organization.id,
            userAccountId: actor!.id,
            active: true,
            roleType: { code: RoleCode.ORG_ADMIN },
          },
          select: { id: true },
        });
        if (!membership) {
          throw new OrganizationSettingsError(
            "You do not have permission to edit organization settings.",
          );
        }
      }

      const current = await tx.organization.findUnique({
        where: { id: organization.id },
      });
      if (!current?.active) {
        throw new OrganizationSettingsError(
          "Organization settings are not available for this church.",
        );
      }
      const predecessorKey = current.logoStorageKey ?? null;
      const nextLogo = options.removeLogo
        ? null
        : staged?.storageKey ?? predecessorKey;
      await seamStore.getStore()?.afterLock?.({
        organizationId: organization.id,
        predecessorKey,
      });
      await notifyGivingHouseholdLocksAcquired(tx);
      if (samePersistedSettings(current, data, nextLogo)) {
        return { organization: current, predecessorKey: null, committedKey: predecessorKey };
      }

      const updated = await updateOrganization(
        organization.id,
        { ...data, logoStorageKey: nextLogo },
        tx,
      );
      const changes = buildOrganizationAuditChanges(
        auditValues(current),
        auditValues(updated),
      );
      if (changes.length > 0) {
        if (seamStore.getStore()?.failAudit) {
          throw new Error("Injected organization settings audit failure");
        }
        await createAuditEvent(
          {
            organizationId: updated.id,
            actorUserAccountId: actor?.id ?? null,
            action: "UPDATE",
            entityType: "Organization",
            entityId: updated.id,
            changes,
          },
          tx,
        );
      }
      return {
        organization: updated,
        predecessorKey,
        committedKey: updated.logoStorageKey ?? null,
      };
    }, { maxWait: 10_000, timeout: 20_000 });

    const cleanupNotice = await cleanupPredecessor({
      organizationId: saved.organization.id,
      predecessorKey: saved.predecessorKey,
      committedKey: saved.committedKey,
    });
    return { organization: saved.organization, cleanupNotice };
  } catch (error) {
    if (staged) {
      const committed = await discardStagedLogo(
        organization.id,
        staged.storageKey,
      );
      if (committed) {
        const current = await prisma.organization.findUnique({
          where: { id: organization.id },
        });
        if (current) {
          return { organization: current, cleanupNotice: null };
        }
      }
    }
    throw error;
  }
}

export async function getOrganizationSettingsAuditLog() {
  const organization = await findPrimaryOrganization();

  if (!organization) {
    return [];
  }

  const { findOrganizationAuditEvents } = await import(
    "@/server/repositories/audit-event.repository"
  );

  return findOrganizationAuditEvents(organization.id);
}
