import {
  toOrganizationSettingsFormValues,
  type OrganizationSettingsFormValues,
  type OrganizationSettingsInput,
} from "@/lib/validation/organization-settings";
import {
  createOrganization,
  findOrganizationBySlug,
  findPrimaryOrganization,
  updateOrganization,
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
    contactEmail: input.email ?? null,
    websiteUrl: input.website ?? null,
    statementFooterText: input.statementFooter ?? null,
    timeZone: input.timeZone,
  };
}

export async function getOrganizationSettingsValues(): Promise<OrganizationSettingsFormValues> {
  const organization = await findPrimaryOrganization();

  return toOrganizationSettingsFormValues(organization);
}

export async function saveOrganizationSettings(input: OrganizationSettingsInput) {
  const organization = await findPrimaryOrganization();
  const data = mapInputToPersistence(input);

  if (!organization) {
    return createOrganization({
      ...data,
      slug: await createUniqueSlug(input.displayName),
    });
  }

  return updateOrganization(organization.id, {
    name: data.name,
    displayName: data.displayName,
    ein: data.ein,
    mailingAddressLine1: data.mailingAddressLine1,
    mailingAddressLine2: data.mailingAddressLine2,
    city: data.city,
    state: data.state,
    postalCode: data.postalCode,
    country: data.country,
    contactPhone: data.contactPhone,
    contactEmail: data.contactEmail,
    websiteUrl: data.websiteUrl,
    timeZone: data.timeZone,
    statementFooterText: data.statementFooterText,
  });
}
