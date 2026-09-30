import { getAnnouncementAccess } from "@/lib/auth/announcement-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import {
  announcementAudienceScopeLabel,
  CHURCH_ANNOUNCEMENTS_HREF,
  countAnnouncementAudience,
  formatAnnouncementPublishedDate,
  parseAnnouncementAudienceFilter,
  type AnnouncementAudienceCounts,
  type AnnouncementAudienceMinistryOption,
  type AnnouncementAudiencePublishedItem,
} from "@/lib/validation/announcement-audience-preview";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export type AnnouncementAudiencePreviewView =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | {
      status: "INVALID_FILTER";
      ministries: AnnouncementAudienceMinistryOption[];
    }
  | {
      status: "READY";
      counts: AnnouncementAudienceCounts;
      publishedAnnouncements: AnnouncementAudiencePublishedItem[];
      ministries: AnnouncementAudienceMinistryOption[];
      selectedMinistry: AnnouncementAudienceMinistryOption | null;
      scopeLabel: string;
    };

const memberSelect = {
  email: true,
  phone: true,
  allowEmail: true,
  allowSms: true,
} as const;

const publishedSelect = {
  id: true,
  title: true,
  publishedAt: true,
} as const;

const ministrySelect = {
  id: true,
  name: true,
} as const;

async function requireAudienceAccess() {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" as const };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" as const };

  const access = await getAnnouncementAccess(organization.id);
  if (!access.canManageAnnouncements) {
    return { status: "UNAUTHORIZED" as const };
  }

  return {
    status: "READY" as const,
    organization,
  };
}

function toMinistryOptions(
  rows: Array<{ id: string; name: string }>,
): AnnouncementAudienceMinistryOption[] {
  return rows.map((row) => ({ id: row.id, name: row.name }));
}

export async function getAnnouncementAudiencePreview(
  input: unknown = {},
): Promise<AnnouncementAudiencePreviewView> {
  const access = await requireAudienceAccess();
  if (access.status !== "READY") return access;

  const ministries = toMinistryOptions(
    await prisma.ministry.findMany({
      where: {
        organizationId: access.organization.id,
        isActive: true,
      },
      select: ministrySelect,
      orderBy: { name: "asc" },
    }),
  );

  const parsed = parseAnnouncementAudienceFilter(input);
  if (!parsed.success) return { status: "INVALID_FILTER", ministries };

  const selectedMinistry = parsed.data.ministryId
    ? (ministries.find((ministry) => ministry.id === parsed.data.ministryId) ??
      null)
    : null;
  if (parsed.data.ministryId && !selectedMinistry) {
    return { status: "INVALID_FILTER", ministries };
  }

  const [members, published] = await Promise.all([
    prisma.member.findMany({
      where: selectedMinistry
        ? {
            organizationId: access.organization.id,
            recordStatus: "ACTIVE",
            ministries: {
              some: {
                ministryId: selectedMinistry.id,
                status: "ACTIVE",
                endedDate: null,
              },
            },
          }
        : {
            organizationId: access.organization.id,
            recordStatus: "ACTIVE",
          },
      select: memberSelect,
    }),
    prisma.churchAnnouncement.findMany({
      where: {
        organizationId: access.organization.id,
        status: "PUBLISHED",
        publishedAt: { not: null },
      },
      select: publishedSelect,
      orderBy: [{ publishedAt: "desc" }, { title: "asc" }],
    }),
  ]);

  return {
    status: "READY",
    counts: countAnnouncementAudience(members),
    publishedAnnouncements: published.flatMap((row) => {
      if (!row.publishedAt) return [];
      return [
        {
          id: row.id,
          title: row.title,
          publishedAtLabel: formatAnnouncementPublishedDate(row.publishedAt),
          href: CHURCH_ANNOUNCEMENTS_HREF,
        },
      ];
    }),
    ministries,
    selectedMinistry,
    scopeLabel: announcementAudienceScopeLabel(selectedMinistry?.name),
  };
}
