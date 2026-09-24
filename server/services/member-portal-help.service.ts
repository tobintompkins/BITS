import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import {
  sanitizeMemberHelpAddress,
  sanitizeMemberHelpEmail,
  sanitizeMemberHelpPhone,
  sanitizeMemberHelpWebsite,
} from "@/lib/validation/member-portal-help";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export type MemberPortalHelpContact = {
  name: string;
  displayName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  websiteUrl: string | null;
  timeZone: string | null;
  mailingAddress: {
    mailingAddressLine1: string | null;
    mailingAddressLine2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
  } | null;
};

export type MemberPortalHelpResult =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "READY"; organization: MemberPortalHelpContact };

/**
 * Public church-office contact details for signed-in members.
 * A linked donor is not required. Sensitive organization fields are omitted.
 */
export async function getMemberPortalHelp(): Promise<MemberPortalHelpResult> {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" };

  const name = organization.name.trim();
  const displayName = organization.displayName?.trim() || name;

  return {
    status: "READY",
    organization: {
      name,
      displayName,
      contactEmail: sanitizeMemberHelpEmail(organization.contactEmail),
      contactPhone: sanitizeMemberHelpPhone(organization.contactPhone),
      websiteUrl: sanitizeMemberHelpWebsite(organization.websiteUrl),
      timeZone: organization.timeZone?.trim() || null,
      mailingAddress: sanitizeMemberHelpAddress(organization),
    },
  };
}
