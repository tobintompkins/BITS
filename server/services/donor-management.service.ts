import { auth } from "@clerk/nextjs/server";
import { Prisma, RoleCode } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { donorSchema } from "@/lib/validation/donor";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";

export class DonorManagementError extends Error {}
const readers: RoleCode[] = [RoleCode.ORG_ADMIN, RoleCode.TREASURER, RoleCode.DATA_ENTRY, RoleCode.REPORT_VIEWER];
const writers: RoleCode[] = [RoleCode.ORG_ADMIN, RoleCode.TREASURER, RoleCode.DATA_ENTRY];

// Never choose the first church globally or provision privileges while reading donors.
export async function requireDonorAccess(write = false, expectedOrganizationId?: string) {
  const { userId, orgId } = await auth();
  if (!userId) throw new DonorManagementError("Sign in to access donors.");
  const actor = await prisma.userAccount.findUnique({ where: { clerkUserId: userId } });
  if (!actor?.active) throw new DonorManagementError("An active staff account is required.");
  const memberships = await prisma.organizationMembership.findMany({
    where: { userAccountId: actor.id, active: true, organization: { active: true, ...(orgId ? { clerkOrganizationId: orgId } : {}) } },
    include: { roleType: true, organization: true }, take: 2,
  });
  if (memberships.length !== 1) throw new DonorManagementError("Select a church organization with an active staff membership.");
  const membership = memberships[0];
  if (!(write ? writers : readers).includes(membership.roleType.code)) throw new DonorManagementError("You do not have permission to perform this donor action.");
  if (expectedOrganizationId && expectedOrganizationId !== membership.organizationId) throw new DonorManagementError("Your church selection changed. Reload this page before saving.");
  return { actor, organization: membership.organization, canEdit: writers.includes(membership.roleType.code) };
}

export async function listDonors(query: string, status: string, requestedPage: number) {
  const access = await requireDonorAccess();
  const q = query.trim().slice(0, 100);
  const page = Number.isSafeInteger(requestedPage) ? Math.max(1, Math.min(100000, requestedPage)) : 1;
  const where: Prisma.DonorWhereInput = {
    organizationId: access.organization.id,
    ...(status === "inactive" ? { active: false } : status === "all" ? {} : { active: true }),
    ...(q ? { AND: q.split(/\s+/).map(term => ({ OR: ["firstName", "lastName", "email"].map(field => ({ [field]: { contains: term, mode: "insensitive" } })) })) } : {}),
  };
  const [donors, total] = await Promise.all([
    prisma.donor.findMany({ where, select: { id: true, firstName: true, lastName: true, email: true, phone: true, active: true, deceased: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }], skip: (page - 1) * 25, take: 25 }),
    prisma.donor.count({ where }),
  ]);
  return { ...access, donors, total, page, q };
}

export async function getDonor(id: string) {
  const access = await requireDonorAccess();
  const donor = await prisma.donor.findFirst({ where: { id, organizationId: access.organization.id } });
  if (!donor) throw new DonorManagementError("Donor not found in this church.");
  return { ...access, donor };
}

export async function saveDonor(organizationId: string, id: string | null, raw: unknown) {
  const { actor, organization } = await requireDonorAccess(true, organizationId);
  const parsed = donorSchema.safeParse(raw);
  if (!parsed.success) throw new DonorManagementError(parsed.error.issues[0]?.message ?? "Check donor details.");
  const data = parsed.data;
  return prisma.$transaction(async tx => {
    const before = id ? await tx.donor.findFirst({ where: { id, organizationId: organization.id } }) : null;
    if (id && !before) throw new DonorManagementError("Donor not found in this church.");
    const donor = id
      ? await tx.donor.update({ where: { id, organizationId: organization.id }, data })
      : await tx.donor.create({ data: { ...data, organizationId: organization.id } });
    // Record changed field names without copying contact details or private notes to audit logs.
    const fields = Object.keys(data).filter(key => !before || String(before[key as keyof typeof before] ?? "") !== String(data[key as keyof typeof data] ?? ""));
    await createAuditEvent({ organizationId: organization.id, actorUserAccountId: actor.id,
      action: id ? "DONOR_PROFILE_UPDATED" : "DONOR_CREATED", entityType: "Donor", entityId: donor.id,
      changes: fields.map(field => ({ field, oldValue: null, newValue: "changed" })),
    }, tx);
    return { id: donor.id };
  });
}
