import { prisma } from "@/lib/db/prisma";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import {
  MEMBER_ANNOUNCEMENTS_MAX,
  MEMBER_ANNOUNCEMENTS_PAGE_SIZE,
  parseMemberAnnouncementsQuery,
} from "@/lib/validation/member-announcements";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export type MemberAnnouncement = {
  id: string;
  title: string;
  body: string;
  publishedAt: Date;
  isRead: boolean;
  readAt: Date | null;
};

export type MemberAnnouncementsResult =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | {
      status: "READY";
      page: number;
      pageSize: number;
      pageCount: number;
      totalCount: number;
      announcements: MemberAnnouncement[];
    };

const publishedWhere = (organizationId: string) => ({
  organizationId,
  status: "PUBLISHED" as const,
  publishedAt: { not: null },
});

/**
 * Member-facing published church announcements.
 * A linked donor is not required. IDs are never taken from the client.
 */
export async function getMemberAnnouncements(
  input: Record<string, string | string[] | undefined> = {},
): Promise<MemberAnnouncementsResult> {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" };

  const parsed = parseMemberAnnouncementsQuery(input);
  const where = publishedWhere(organization.id);

  const matchingCount = await prisma.churchAnnouncement.count({ where });
  const totalCount = Math.min(matchingCount, MEMBER_ANNOUNCEMENTS_MAX);
  const pageCount = Math.max(1, Math.ceil(totalCount / MEMBER_ANNOUNCEMENTS_PAGE_SIZE));
  const page = Math.min(parsed.page, pageCount);
  const skip = (page - 1) * MEMBER_ANNOUNCEMENTS_PAGE_SIZE;
  const take = Math.max(0, Math.min(MEMBER_ANNOUNCEMENTS_PAGE_SIZE, totalCount - skip));

  const rows =
    take === 0
      ? []
      : await prisma.churchAnnouncement.findMany({
          where,
          orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
          skip,
          take,
          select: {
            id: true,
            title: true,
            body: true,
            publishedAt: true,
            readReceipts: {
              where: {
                organizationId: organization.id,
                userAccountId: userAccount.id,
              },
              select: { readAt: true },
              take: 1,
            },
          },
        });

  return {
    status: "READY",
    page,
    pageSize: MEMBER_ANNOUNCEMENTS_PAGE_SIZE,
    pageCount,
    totalCount,
    announcements: rows.flatMap((row) =>
      row.publishedAt
        ? [
            {
              id: row.id,
              title: row.title,
              body: row.body,
              publishedAt: row.publishedAt,
              isRead: Boolean(row.readReceipts[0]?.readAt),
              readAt: row.readReceipts[0]?.readAt ?? null,
            },
          ]
        : [],
    ),
  };
}
