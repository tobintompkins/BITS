import {
  buildOrganizationAuditChanges,
  toOrganizationSettingsFormValues,
  type OrganizationSettingsFormValues,
  type OrganizationSettingsInput,
} from "@/lib/validation/organization-settings";
import {
  getLogoPublicUrl,
  removeOrganizationLogoFile,
  saveOrganizationLogo,
} from "@/lib/storage/organization-logo";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import { prisma } from "@/lib/db/prisma";
import {
  createOrganization,
  findOrganizationBySlug,
  findPrimaryOrganization,
  updateOrganization,
  updateOrganizationLogo,
  type OrganizationWriteInput,
} from "@/server/repositories/organization.repository";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

async function createUniqueSlug(baseValue: string) {
  const baseSlug = slugify(baseValue) || "bits-organization";
  let candidate = baseSlug;
  let suffix = 2;

  while (await findOrganizationBySlug(candidate)) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

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

type SaveOrganizationSettingsOptions = {
  actorUserAccountId: string | null;
  logoFile?: File | null;
  removeLogo?: boolean;
};

export async function saveOrganizationSettings(
  input: OrganizationSettingsInput,
  options: SaveOrganizationSettingsOptions,
) {
  const organization = await findPrimaryOrganization();
  const data = mapInputToPersistence(input);
  const previousValues = toOrganizationSettingsFormValues(organization);

  let savedOrganization;

  if (!organization) {
    savedOrganization = await createOrganization({
      ...data,
      slug: await createUniqueSlug(input.displayName),
    });

    if (options.actorUserAccountId) {
      const orgAdminRole = await prisma.roleType.findUnique({
        where: { code: "ORG_ADMIN" },
      });

      if (orgAdminRole) {
        await prisma.organizationMembership.create({
          data: {
            organizationId: savedOrganization.id,
            userAccountId: options.actorUserAccountId,
            roleTypeId: orgAdminRole.id,
            active: true,
          },
        });
      }
    }
  } else {
    savedOrganization = await updateOrganization(organization.id, data);
  }

  if (options.removeLogo) {
    await removeOrganizationLogoFile(savedOrganization.logoStorageKey);
    savedOrganization = await updateOrganizationLogo(savedOrganization.id, null);
  } else if (options.logoFile) {
    await removeOrganizationLogoFile(savedOrganization.logoStorageKey);
    const { storageKey } = await saveOrganizationLogo(
      savedOrganization.id,
      options.logoFile,
    );
    savedOrganization = await updateOrganizationLogo(
      savedOrganization.id,
      storageKey,
    );
  }

  const nextValues = {
    ...toOrganizationSettingsFormValues(savedOrganization),
    logoUrl: getLogoPublicUrl(savedOrganization.logoStorageKey) ?? "",
  };

  const changes = buildOrganizationAuditChanges(previousValues, nextValues);

  if (changes.length > 0) {
    await createAuditEvent({
      organizationId: savedOrganization.id,
      actorUserAccountId: options.actorUserAccountId,
      action: organization ? "UPDATE" : "CREATE",
      entityType: "Organization",
      entityId: savedOrganization.id,
      changes,
    });
  }

  return savedOrganization;
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
