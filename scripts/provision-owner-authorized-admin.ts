import { ChurchAccessStatus, RoleCode } from "@/app/generated/prisma/client";
import {
  OWNER_AUTHORIZED_DIRECT_ACCESS_ACTION,
  planOwnerAuthorizedAdmin,
} from "@/lib/auth/owner-authorized-admin";
import { prisma } from "@/lib/db/prisma";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";

function requiredEnv(name: string) {
  const value = process.env[name]?.trim() ?? "";
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function clerkUser(secret: string, userId: string) {
  const response = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!response.ok) throw new Error(`Clerk user lookup failed (${response.status})`);
  const body = (await response.json()) as {
    id?: string;
    first_name?: string | null;
    last_name?: string | null;
    email_addresses?: Array<{ id?: string; email_address?: string }>;
    primary_email_address_id?: string | null;
  };
  const email =
    body.email_addresses?.find((row) => row.id === body.primary_email_address_id)
      ?.email_address ?? body.email_addresses?.[0]?.email_address ?? "";
  const displayName = [body.first_name, body.last_name]
    .map((part) => part?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
  return {
    id: body.id ?? "",
    email: email.trim().toLowerCase(),
    displayName,
  };
}

async function main() {
  if (process.env.BITS_OWNER_PROVISION !== "1") {
    throw new Error("Refusing to provision without BITS_OWNER_PROVISION=1");
  }
  const ownerClerkUserId = requiredEnv("BITS_OWNER_CLERK_USER_ID");
  const churchAdminClerkUserId = requiredEnv("BITS_CHURCH_ADMIN_CLERK_USER_ID");
  const churchClerkOrgId = requiredEnv("BITS_CHURCH_CLERK_ORG_ID");
  const clerkSecret = requiredEnv("CLERK_SECRET_KEY");
  const churchAdmin = await clerkUser(clerkSecret, churchAdminClerkUserId);
  if (churchAdmin.id !== churchAdminClerkUserId || !churchAdmin.email) {
    throw new Error("Clerk did not return the selected church administrator.");
  }

  const report = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.findUnique({
      where: { clerkOrganizationId: churchClerkOrgId },
      select: { id: true },
    });
    const ownerAccount = await tx.userAccount.findUnique({
      where: { clerkUserId: ownerClerkUserId },
      select: { id: true, clerkUserId: true, primaryEmail: true, appOwner: true },
    });
    const otherOwner = await tx.userAccount.findFirst({
      where: { appOwner: true, NOT: { clerkUserId: ownerClerkUserId } },
      select: { id: true },
    });
    const churchAdminAccount = await tx.userAccount.findUnique({
      where: { clerkUserId: churchAdminClerkUserId },
      select: { id: true, clerkUserId: true, primaryEmail: true, appOwner: true },
    });
    const emailAccount = await tx.userAccount.findFirst({
      where: { primaryEmail: { equals: churchAdmin.email, mode: "insensitive" } },
      select: { id: true, clerkUserId: true, primaryEmail: true, appOwner: true },
    });
    const membership = churchAdminAccount
      ? await tx.organizationMembership.findUnique({
          where: {
            organizationId_userAccountId: {
              organizationId: organization?.id ?? "00000000-0000-0000-0000-000000000000",
              userAccountId: churchAdminAccount.id,
            },
          },
          select: {
            id: true,
            userAccountId: true,
            active: true,
            churchAccess: true,
            roleType: { select: { code: true } },
          },
        })
      : null;
    const plan = planOwnerAuthorizedAdmin({
      organizationId: organization?.id ?? null,
      ownerClerkUserId,
      churchAdminClerkUserId,
      churchAdminEmail: churchAdmin.email,
      ownerAccount,
      otherOwnerAccountId: otherOwner?.id ?? null,
      churchAdminAccount,
      emailAccount,
      membership: membership
        ? {
            id: membership.id,
            userAccountId: membership.userAccountId,
            roleCode: membership.roleType.code,
            active: membership.active,
            churchAccess: membership.churchAccess,
          }
        : null,
    });
    if (!plan.ok) return plan;

    if (plan.designateOwner) {
      await tx.userAccount.update({
        where: { id: plan.ownerAccountId },
        data: { appOwner: true },
      });
    }

    let churchAdminAccountId = plan.churchAdminAccountId;
    if (plan.createAccount) {
      const created = await tx.userAccount.create({
        data: {
          clerkUserId: churchAdminClerkUserId,
          primaryEmail: churchAdmin.email,
          displayName: churchAdmin.displayName || null,
          active: true,
          appOwner: false,
        },
        select: { id: true },
      });
      churchAdminAccountId = created.id;
    }
    if (!churchAdminAccountId) throw new Error("Church administrator account was not saved.");

    const role = await tx.roleType.findUnique({
      where: { code: RoleCode.ORG_ADMIN },
      select: { id: true },
    });
    if (!role) throw new Error("Organization Admin role is missing.");

    let membershipId = plan.membershipId;
    if (plan.createMembership) {
      const created = await tx.organizationMembership.create({
        data: {
          organizationId: plan.organizationId,
          userAccountId: churchAdminAccountId,
          roleTypeId: role.id,
          active: true,
          churchAccess: ChurchAccessStatus.ACTIVE,
        },
        select: { id: true },
      });
      membershipId = created.id;
    } else if (plan.updateMembership && membershipId) {
      await tx.organizationMembership.update({
        where: { id: membershipId },
        data: {
          roleTypeId: role.id,
          active: true,
          churchAccess: ChurchAccessStatus.ACTIVE,
          version: { increment: 1 },
        },
      });
    }
    if (!membershipId) throw new Error("Church administrator membership was not saved.");

    if (plan.designateOwner || plan.createAccount || plan.createMembership || plan.updateMembership) {
      await createAuditEvent(
        {
          organizationId: plan.organizationId,
          actorUserAccountId: plan.ownerAccountId,
          action: OWNER_AUTHORIZED_DIRECT_ACCESS_ACTION,
          entityType: "OrganizationMembership",
          entityId: membershipId,
          changes: [
            { field: "accessMethod", oldValue: null, newValue: "direct-provision" },
            { field: "invitationSent", oldValue: null, newValue: "false" },
            { field: "passwordStoredInBits", oldValue: null, newValue: "false" },
            {
              field: "onboarding",
              oldValue: null,
              newValue: "temporary-password-pending-clerk-reset-task-unconfirmed",
            },
            {
              field: "ownerDesignated",
              oldValue: null,
              newValue: plan.designateOwner ? "true" : "already-designated",
            },
          ],
        },
        tx,
      );
    }

    return {
      ok: true as const,
      organizationId: plan.organizationId,
      ownerAccountId: plan.ownerAccountId,
      churchAdminAccountId,
      membershipId,
      createdAccount: plan.createAccount,
      createdMembership: plan.createMembership,
      updatedMembership: plan.updateMembership,
      designatedOwner: plan.designateOwner,
      alreadyActiveAdmin: plan.alreadyActiveAdmin,
      invitationSent: false,
      passwordStoredInBits: false,
    };
  });

  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (!report.ok) process.exit(2);
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Provisioning failed.";
    process.stderr.write(`${message}\n`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
