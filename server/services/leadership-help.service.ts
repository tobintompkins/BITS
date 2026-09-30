import { getAnnouncementAccess } from "@/lib/auth/announcement-permissions";
import { getCareAccess } from "@/lib/auth/care-permissions";
import { getEventAccess } from "@/lib/auth/event-permissions";
import { getGivingAccess } from "@/lib/auth/giving-permissions";
import { getMemberEngagementAccess } from "@/lib/auth/member-engagement-permissions";
import { getMemberAccess } from "@/lib/auth/member-permissions";
import { getOrganizationAccess } from "@/lib/auth/permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import {
  buildLeadershipHelpCards,
  selectLeadershipHelpContact,
  type LeadershipHelpCard,
  type LeadershipHelpContact,
} from "@/lib/leadership-help/leadership-help";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export type LeadershipHelpView =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | {
      status: "READY";
      cards: LeadershipHelpCard[];
      contact: LeadershipHelpContact;
    };

export async function getLeadershipHelp(): Promise<LeadershipHelpView> {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" };

  const [
    memberAccess,
    careAccess,
    eventAccess,
    givingAccess,
    engagementAccess,
    announcementAccess,
    organizationAccess,
  ] = await Promise.all([
    getMemberAccess(organization.id),
    getCareAccess(organization.id),
    getEventAccess(organization.id),
    getGivingAccess(organization.id),
    getMemberEngagementAccess(organization.id),
    getAnnouncementAccess(organization.id),
    getOrganizationAccess(organization.id),
  ]);

  return {
    status: "READY",
    cards: buildLeadershipHelpCards({
      canViewMembers: memberAccess.canView,
      canViewPrayerRequests: careAccess.canViewPrayerRequests,
      canViewPastoralCare: careAccess.canViewPastoralCare,
      canViewEvents: eventAccess.canView,
      canViewAttendance: careAccess.canViewAttendance,
      canViewGiving: givingAccess.canViewGiving,
      canViewStatements: givingAccess.canViewStatements,
      canViewMinistries: engagementAccess.canViewMinistries,
      canManageMinistryRosters: engagementAccess.canManageMinistryRosters,
      canManageAnnouncements: announcementAccess.canManageAnnouncements,
      canEditOrganization: organizationAccess.canEdit,
    }),
    contact: selectLeadershipHelpContact(organization),
  };
}
