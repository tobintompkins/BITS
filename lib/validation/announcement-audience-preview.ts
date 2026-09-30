import { z } from "zod";

import { formatVolunteerTimeOffDate } from "@/lib/validation/volunteer-time-off-request";

export const ANNOUNCEMENT_AUDIENCE_HREF = "/announcements/audience";
export const CHURCH_ANNOUNCEMENTS_HREF = "/announcements";

export const ANNOUNCEMENT_AUDIENCE_SUBTITLE =
  "Review eligible audience counts before future email or text delivery is enabled.";

export const ANNOUNCEMENT_AUDIENCE_NOTICE =
  "No messages are sent from this page. Delivery will be added in a later communications step.";

export const ANNOUNCEMENT_AUDIENCE_PUBLISHED_EMPTY =
  "No published announcements yet. These audience counts still apply when delivery is added later.";

export const ANNOUNCEMENT_AUDIENCE_ALL_SCOPE =
  "Showing all active members.";

export const ANNOUNCEMENT_AUDIENCE_INVALID_MINISTRY =
  "Choose a valid active ministry for this church.";

export type AnnouncementAudienceMinistryOption = {
  id: string;
  name: string;
};

export type AnnouncementAudienceCounts = {
  activeMembers: number;
  emailEligible: number;
  emailExcludedOptOut: number;
  emailExcludedMissingAddress: number;
  textEligible: number;
  textExcludedOptOut: number;
  textExcludedMissingPhone: number;
};

export type AnnouncementAudiencePublishedItem = {
  id: string;
  title: string;
  publishedAtLabel: string;
  href: string;
};

export type AnnouncementAudienceNavItem = {
  href: string;
  label: string;
};

export type AnnouncementAudienceMemberInput = {
  email: string | null;
  phone: string | null;
  allowEmail: boolean;
  allowSms: boolean;
};

export function announcementAudiencePreviewNavItems(
  canManageAnnouncements: boolean,
): AnnouncementAudienceNavItem[] {
  return canManageAnnouncements
    ? [
        {
          href: ANNOUNCEMENT_AUDIENCE_HREF,
          label: "Announcement Audience Preview",
        },
      ]
    : [];
}

export function hasAnnouncementContactValue(value: string | null | undefined) {
  return Boolean(value?.trim());
}

export function countAnnouncementAudience(
  members: AnnouncementAudienceMemberInput[],
): AnnouncementAudienceCounts {
  const counts: AnnouncementAudienceCounts = {
    activeMembers: members.length,
    emailEligible: 0,
    emailExcludedOptOut: 0,
    emailExcludedMissingAddress: 0,
    textEligible: 0,
    textExcludedOptOut: 0,
    textExcludedMissingPhone: 0,
  };

  for (const member of members) {
    if (!hasAnnouncementContactValue(member.email)) {
      counts.emailExcludedMissingAddress += 1;
    } else if (!member.allowEmail) {
      counts.emailExcludedOptOut += 1;
    } else {
      counts.emailEligible += 1;
    }

    if (!hasAnnouncementContactValue(member.phone)) {
      counts.textExcludedMissingPhone += 1;
    } else if (!member.allowSms) {
      counts.textExcludedOptOut += 1;
    } else {
      counts.textEligible += 1;
    }
  }

  return counts;
}

export function formatAnnouncementPublishedDate(value: Date) {
  return formatVolunteerTimeOffDate(value);
}

export function announcementAudienceScopeLabel(ministryName?: string | null) {
  if (!ministryName) return ANNOUNCEMENT_AUDIENCE_ALL_SCOPE;
  return `Showing active members assigned to ${ministryName}.`;
}

function firstString(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

function optionalText(value: unknown) {
  const text = firstString(value).trim();
  return text || undefined;
}

export function parseAnnouncementAudienceFilter(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const ministryId = optionalText(record.ministryId);
  if (!ministryId) {
    return { success: true as const, data: { ministryId: null } };
  }
  const parsed = z.string().uuid().safeParse(ministryId);
  if (!parsed.success) return { success: false as const };
  return { success: true as const, data: { ministryId: parsed.data } };
}
