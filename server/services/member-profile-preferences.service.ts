import { prisma } from "@/lib/db/prisma";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import {
  MEMBER_PROFILE_AUDIT_FIELDS,
  memberProfilePreferencesSchema,
} from "@/lib/validation/member-profile-preferences";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

const profileSelect = {
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  preferredCommunicationMethod: true,
} as const;

function toProfile(donor: {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  preferredCommunicationMethod: string | null;
}) {
  return {
    firstName: donor.firstName,
    lastName: donor.lastName,
    email: donor.email,
    phone: donor.phone,
    preferredCommunicationMethod: donor.preferredCommunicationMethod,
  };
}

async function resolveLinkedDonor() {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" as const };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" as const };

  return {
    status: "LINKED" as const,
    userAccount,
    organization,
  };
}

/**
 * Member-facing profile for the signed-in linked donor only.
 * Donor IDs are never taken from the client.
 */
export async function getMemberProfilePreferences() {
  const access = await resolveLinkedDonor();
  if (access.status !== "LINKED") return access;

  const donor = await prisma.donor.findFirst({
    where: {
      organizationId: access.organization.id,
      userAccountId: access.userAccount.id,
      active: true,
    },
    select: profileSelect,
  });
  if (!donor) {
    return {
      status: "CONNECTION_PENDING" as const,
      accountEmail: access.userAccount.primaryEmail,
    };
  }

  return {
    status: "READY" as const,
    profile: toProfile(donor),
  };
}

export async function updateMemberProfilePreferences(input: unknown) {
  const parsed = memberProfilePreferencesSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "INVALID" as const,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const access = await resolveLinkedDonor();
  if (access.status !== "LINKED") return access;

  return prisma.$transaction(async (tx) => {
    const donor = await tx.donor.findFirst({
      where: {
        organizationId: access.organization.id,
        userAccountId: access.userAccount.id,
        active: true,
      },
      select: { id: true, ...profileSelect },
    });
    if (!donor) {
      return {
        status: "CONNECTION_PENDING" as const,
        accountEmail: access.userAccount.primaryEmail,
      };
    }

    const next = parsed.data;
    const changes = MEMBER_PROFILE_AUDIT_FIELDS.flatMap((field) => {
      const oldValue = donor[field];
      const newValue = next[field];
      if (oldValue === newValue) return [];
      return [{ field, oldValue, newValue }];
    });

    if (changes.length === 0) {
      return {
        status: "READY" as const,
        profile: toProfile(donor),
        unchanged: true,
      };
    }

    const updated = await tx.donor.updateMany({
      where: {
        id: donor.id,
        organizationId: access.organization.id,
        userAccountId: access.userAccount.id,
        active: true,
      },
      data: {
        email: next.email,
        phone: next.phone,
        preferredCommunicationMethod: next.preferredCommunicationMethod,
      },
    });
    if (updated.count !== 1) {
      throw new Error("Unable to update your profile right now.");
    }

    await createAuditEvent(
      {
        organizationId: access.organization.id,
        actorUserAccountId: access.userAccount.id,
        action: "UPDATE_MEMBER_PORTAL_PROFILE",
        entityType: "Donor",
        entityId: donor.id,
        changes,
      },
      tx,
    );

    return {
      status: "READY" as const,
      profile: toProfile({
        firstName: donor.firstName,
        lastName: donor.lastName,
        email: next.email,
        phone: next.phone,
        preferredCommunicationMethod: next.preferredCommunicationMethod,
      }),
      unchanged: false,
    };
  });
}
