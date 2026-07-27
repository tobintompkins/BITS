import {
  buildMemberExportCsv,
  getMemberCsvTemplate,
  parseMemberCsv,
} from "@/lib/csv/member-csv";
import { prisma } from "@/lib/db/prisma";
import {
  buildMemberImportPreview,
  type MemberImportPreview,
} from "@/lib/validation/member-import";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import { findMemberEmails } from "@/server/repositories/emergency-contact.repository";
import { findMembers } from "@/server/repositories/member.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";
import { createMemberRecord } from "@/server/services/member.service";

async function getOrganizationId() {
  const organization = await findPrimaryOrganization();

  if (!organization) {
    throw new Error("Organization not found. Configure organization settings first.");
  }

  return organization.id;
}

export async function downloadMemberCsvTemplate() {
  return getMemberCsvTemplate();
}

export async function previewMembersImport(csvContent: string): Promise<MemberImportPreview> {
  const organizationId = await getOrganizationId();
  const { dataRows } = parseMemberCsv(csvContent);
  const existingEmails = await findMemberEmails(organizationId);
  const existingMembers = await findMembers({ organizationId });
  const scoringInputs = existingMembers.map((member) => ({
    id: member.id,
    firstName: member.firstName,
    lastName: member.lastName,
    preferredName: member.preferredName,
    email: member.email,
    phone: member.phone,
    alternatePhone: member.alternatePhone,
    dateOfBirth: member.dateOfBirth,
    addressLine1: member.addressLine1,
    city: member.city,
    state: member.state,
    postalCode: member.postalCode,
    recordStatus: member.recordStatus,
    householdIds: member.householdLinks.map((link) => link.household.id),
  }));

  return buildMemberImportPreview(dataRows, existingEmails, scoringInputs);
}

export async function importMembersFromCsv(
  csvContent: string,
  actor: { userAccountId: string | null; email: string | null },
) {
  const organizationId = await getOrganizationId();
  const preview = await previewMembersImport(csvContent);
  const importedIds: string[] = [];

  for (const row of preview.validRows) {
    if (!row.data) {
      continue;
    }

    const member = await createMemberRecord(row.data, actor);
    importedIds.push(member.id);
  }

  await createAuditEvent({
    organizationId,
    actorUserAccountId: actor.userAccountId,
    action: "IMPORT",
    entityType: "Member",
    entityId: organizationId,
    changes: [
      {
        field: "totalRows",
        oldValue: null,
        newValue: String(preview.totalRows),
      },
      {
        field: "importedRows",
        oldValue: null,
        newValue: String(importedIds.length),
      },
      {
        field: "skippedRows",
        oldValue: null,
        newValue: String(preview.skipRows.length),
      },
      {
        field: "errorRows",
        oldValue: null,
        newValue: String(preview.errorRows.length),
      },
      {
        field: "actorEmail",
        oldValue: null,
        newValue: actor.email,
      },
    ],
  });

  return {
    totalRows: preview.totalRows,
    importedRows: importedIds.length,
    skippedRows: preview.skipRows.length,
    errorRows: preview.errorRows.length,
    importedIds,
  };
}

export async function exportMembersToCsv(filters: {
  search?: string;
  membershipStatus?: import("@/app/generated/prisma/client").MembershipStatus;
  householdId?: string;
}) {
  const organizationId = await getOrganizationId();
  const members = await findMembers({ organizationId, ...filters });
  const memberIds = members.map((member) => member.id);

  const [primaryGifts, activeMinistries, skills, milestones] = await Promise.all([
    prisma.memberSpiritualGift.findMany({
      where: { memberId: { in: memberIds }, isPrimary: true },
      include: { spiritualGift: { select: { name: true } } },
    }),
    prisma.memberMinistry.findMany({
      where: { memberId: { in: memberIds }, status: "ACTIVE" },
      include: { ministry: { select: { name: true } } },
    }),
    prisma.memberSkill.findMany({
      where: { memberId: { in: memberIds } },
      select: {
        memberId: true,
        skillName: true,
        isAvailableToServe: true,
      },
    }),
    prisma.memberMilestone.findMany({
      where: { memberId: { in: memberIds } },
      select: {
        memberId: true,
        milestoneType: true,
        title: true,
        milestoneDate: true,
      },
      orderBy: { milestoneDate: "desc" },
    }),
  ]);

  const giftByMember = new Map(
    primaryGifts.map((item) => [item.memberId, item.spiritualGift.name]),
  );
  const ministriesByMember = new Map<string, string[]>();
  for (const item of activeMinistries) {
    const list = ministriesByMember.get(item.memberId) ?? [];
    list.push(item.ministry.name);
    ministriesByMember.set(item.memberId, list);
  }
  const skillsByMember = new Map<string, { names: string[]; available: boolean }>();
  for (const item of skills) {
    const current = skillsByMember.get(item.memberId) ?? {
      names: [],
      available: false,
    };
    current.names.push(item.skillName);
    current.available = current.available || item.isAvailableToServe;
    skillsByMember.set(item.memberId, current);
  }
  const milestonesByMember = new Map<string, string[]>();
  for (const item of milestones) {
    const list = milestonesByMember.get(item.memberId) ?? [];
    if (list.length < 5) {
      list.push(
        `${item.milestoneType}: ${item.title} (${item.milestoneDate.toISOString().slice(0, 10)})`,
      );
      milestonesByMember.set(item.memberId, list);
    }
  }

  const enriched = members.map((member) => {
    const skillInfo = skillsByMember.get(member.id);
    return {
      ...member,
      primarySpiritualGift: giftByMember.get(member.id) ?? "",
      activeMinistries: (ministriesByMember.get(member.id) ?? []).join("; "),
      skills: (skillInfo?.names ?? []).join("; "),
      availableToServe: skillInfo?.available ?? false,
      milestoneSummary: (milestonesByMember.get(member.id) ?? []).join("; "),
    };
  });

  return buildMemberExportCsv(enriched, { includeEngagement: true });
}

export async function recordMembersExportAudit(
  actor: { userAccountId: string | null; email: string | null },
  rowCount: number,
) {
  const organizationId = await getOrganizationId();

  await createAuditEvent({
    organizationId,
    actorUserAccountId: actor.userAccountId,
    action: "EXPORT",
    entityType: "Member",
    entityId: organizationId,
    changes: [
      {
        field: "exportedRows",
        oldValue: null,
        newValue: String(rowCount),
      },
      {
        field: "actorEmail",
        oldValue: null,
        newValue: actor.email,
      },
    ],
  });
}
