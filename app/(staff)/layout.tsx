import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DisplayOptions } from "@/components/accessibility/display-options";
import {
  AppShellNav,
  type NavGroup,
} from "@/components/layout/app-shell-nav";
import { StaffIdleTimeout } from "@/components/security/staff-idle-timeout";
import { getAnnouncementAccess } from "@/lib/auth/announcement-permissions";
import { getPrivacyRequestAccess } from "@/lib/auth/privacy-request-permissions";
import { getCareAccess } from "@/lib/auth/care-permissions";
import { getEventAccess } from "@/lib/auth/event-permissions";
import { getGivingAccess } from "@/lib/auth/giving-permissions";
import { getOrganizationAccess } from "@/lib/auth/permissions";
import { getMemberAccess } from "@/lib/auth/member-permissions";
import { getMemberEngagementAccess } from "@/lib/auth/member-engagement-permissions";
import { getMemberLifecycleAccess } from "@/lib/auth/member-lifecycle-permissions";
import { leadershipHelpNavItems } from "@/lib/leadership-help/leadership-help";
import { getStaffIdleTimeoutConfig } from "@/lib/security/staff-idle-timeout";
import { staffVolunteerScheduleNavItems } from "@/lib/validation/volunteer-schedule-readiness";
import { staffMinistryResourceNavItems } from "@/lib/validation/ministry-resource";
import { staffAccessDirectoryNavItems } from "@/lib/validation/staff-access-directory";
import { leadershipSecurityActivityNavItems } from "@/lib/validation/leadership-security-activity";
import { churchDataExportNavItems } from "@/lib/validation/church-data-export";
import { dataRetentionPolicyNavItems } from "@/lib/validation/data-retention-policy";
import { backupReadinessNavItems } from "@/lib/validation/backup-readiness";
import { announcementAudiencePreviewNavItems } from "@/lib/validation/announcement-audience-preview";
import { upcomingCelebrationsNavItems } from "@/lib/validation/upcoming-celebrations";
import { churchServiceAlertNavItems } from "@/lib/validation/church-service-alert";
import { staffLeadershipDocumentNavItems } from "@/lib/validation/leadership-document";
import { staffVolunteerTrainingNavItems } from "@/lib/validation/volunteer-training";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export default async function StaffLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const organization = await findPrimaryOrganization();
  const careAccess = organization
    ? await getCareAccess(organization.id)
    : null;
  const engagementAccess = organization
    ? await getMemberEngagementAccess(organization.id)
    : null;
  const lifecycleAccess = organization
    ? await getMemberLifecycleAccess(organization.id)
    : null;
  const eventAccess = organization
    ? await getEventAccess(organization.id)
    : null;
  const givingAccess = organization
    ? await getGivingAccess(organization.id)
    : null;
  const announcementAccess = organization
    ? await getAnnouncementAccess(organization.id)
    : null;
  const privacyRequestAccess = organization
    ? await getPrivacyRequestAccess(organization.id)
    : null;
  const organizationAccess = organization
    ? await getOrganizationAccess(organization.id)
    : null;
  const memberAccess = organization
    ? await getMemberAccess(organization.id)
    : null;
  const staffIdleTimeout = getStaffIdleTimeoutConfig();

  const navGroups: NavGroup[] = [
    {
      label: "Home",
      items: [{ href: "/dashboard", label: "Leadership Home" }],
    },
    {
      label: "People",
      items: [
        { href: "/members", label: "Members" },
        { href: "/households", label: "Households" },
        ...(engagementAccess?.canViewSkillsInterests
          ? [{ href: "/members/skills", label: "Member Skills" }]
          : []),
        ...(lifecycleAccess?.canViewArchived
          ? [{ href: "/members?recordStatus=ARCHIVED", label: "Archived Members" }]
          : []),
        ...(lifecycleAccess?.canReviewDuplicates
          ? [{ href: "/members/duplicates", label: "Duplicate Review" }]
          : []),
      ],
    },
    {
      label: "Ministry",
      items: [
        ...(engagementAccess?.canViewMinistries
          ? [
              { href: "/ministries", label: "Ministries" },
              {
                href: "/volunteer-availability",
                label: "Volunteer Availability",
              },
            ]
          : []),
        ...staffVolunteerScheduleNavItems(
          Boolean(engagementAccess?.canManageMinistryRosters),
        ),
        ...staffVolunteerTrainingNavItems(
          Boolean(engagementAccess?.canManageMinistryRosters),
        ),
        ...staffMinistryResourceNavItems(
          Boolean(engagementAccess?.canManageMinistries),
        ),
      ],
    },
    {
      label: "Pastoral Care",
      items: [
        ...(careAccess?.canViewPrayerRequests
          ? [{ href: "/prayer-requests", label: "Prayer Requests" }]
          : []),
        ...(careAccess?.canViewFollowUps
          ? [{ href: "/follow-ups", label: "Follow-Ups" }]
          : []),
        ...(careAccess?.canViewPastoralCare
          ? [{ href: "/pastoral-care", label: "Pastoral Care" }]
          : []),
      ],
    },
    {
      label: "Church Life",
      items: [
        ...(eventAccess?.canView
          ? [
              { href: "/events", label: "Events" },
              { href: "/events/calendar", label: "Calendar" },
              {
                href: "/events/location-conflicts",
                label: "Location Conflict Review",
              },
              {
                href: "/facilities/rooms",
                label: "Facility & Room Schedule",
              },
              { href: "/equipment", label: "Equipment Inventory" },
              { href: "/equipment/check-out", label: "Equipment Check-Out" },
              { href: "/maintenance-requests", label: "Maintenance Requests" },
              { href: "/purchase-requests", label: "Purchase Requests" },
            ]
          : []),
        ...(careAccess?.canViewAttendance
          ? [{ href: "/attendance", label: "Attendance" }]
          : []),
        ...(announcementAccess?.canManageAnnouncements
          ? [{ href: "/announcements", label: "Church Announcements" }]
          : []),
        ...announcementAudiencePreviewNavItems(
          Boolean(announcementAccess?.canManageAnnouncements),
        ),
        ...churchServiceAlertNavItems(
          Boolean(announcementAccess?.canManageAnnouncements),
        ),
        ...upcomingCelebrationsNavItems(Boolean(memberAccess?.canView)),
      ],
    },
    {
      label: "Giving",
      items: [
        ...(givingAccess?.canViewGiving
          ? [
              { href: "/donors", label: "Donors" },
              { href: "/giving-households", label: "Giving Households" },
              { href: "/offering-types", label: "Offering Types" },
            ]
          : []),
        ...(givingAccess?.canViewBatches
          ? [{ href: "/batches", label: "Batches" }]
          : []),
        ...(givingAccess?.canReviewFinancialCorrections
          ? [{ href: "/batches/corrections", label: "Correction Review Queue" }]
          : []),
        ...(givingAccess?.canViewStatements
          ? [
              { href: "/statements", label: "Statements & Online Giving" },
              { href: "/statements/readiness", label: "Statement Readiness" },
              {
                href: "/statements/recipients",
                label: "Statement Recipient Review",
              },
              {
                href: "/statements/run-review",
                label: "Statement Run Review",
              },
              { href: "/statements/registry", label: "Statement Registry" },
              { href: "/statements/unmatched", label: "Unmatched Gifts" },
            ]
          : []),
        ...(givingAccess?.canManageStatements
          ? [
              {
                href: "/statements/void-requests",
                label: "Statement Void Requests",
              },
            ]
          : []),
      ],
    },
    {
      label: "Reports",
      items: givingAccess?.canExportGiving
        ? [{ href: "/reports", label: "Reports" }]
        : [],
    },
    {
      label: "Administration",
      items: [
        { href: "/settings/organization", label: "Organization Settings" },
        ...staffLeadershipDocumentNavItems(Boolean(organizationAccess?.canEdit)),
        ...(engagementAccess?.canManageSpiritualGiftCatalog ||
        engagementAccess?.canViewSpiritualGifts
          ? [{ href: "/settings/spiritual-gifts", label: "Spiritual Gifts" }]
          : []),
        ...(eventAccess?.canManageCategories
          ? [{ href: "/settings/event-categories", label: "Event Categories" }]
          : []),
        ...(eventAccess?.canManageLocations
          ? [{ href: "/settings/event-locations", label: "Event Locations" }]
          : []),
        ...(eventAccess?.roleCode === "ORG_ADMIN" ||
        eventAccess?.roleCode === "TREASURER"
          ? [
              {
                href: "/settings/member-portal-links",
                label: "Member Portal Connections",
              },
            ]
          : []),
        ...staffAccessDirectoryNavItems(
          Boolean(engagementAccess?.canManageMinistries),
        ),
        ...leadershipSecurityActivityNavItems(
          Boolean(organizationAccess?.canEdit),
        ),
        ...churchDataExportNavItems(Boolean(organizationAccess?.canEdit)),
        ...dataRetentionPolicyNavItems(Boolean(organizationAccess?.canEdit)),
        ...backupReadinessNavItems(Boolean(organizationAccess?.canEdit)),
        ...(privacyRequestAccess?.canReviewPrivacyRequests
          ? [{ href: "/privacy-requests", label: "Privacy & Data Requests" }]
          : []),
        ...leadershipHelpNavItems(),
      ],
    },
  ];

  return (
    <div className="min-h-full bg-[var(--bits-page)]">
      <header className="staff-app-header border-b-4 border-[var(--bits-gold)] bg-[var(--bits-navy)] text-white shadow-sm">
        <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-3 px-4 py-4 sm:gap-4 sm:px-6 lg:px-8">
          <div className="min-w-0">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--bits-gold)]">
              BITS · Leadership Portal
            </p>
            <h1 className="text-lg font-semibold text-white">
              Bring In The Sheaves
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <DisplayOptions />
            <Link
              href="/"
              className="hidden text-sm font-medium text-white/85 underline-offset-4 hover:text-white hover:underline sm:inline"
            >
              Public site
            </Link>
            <UserButton />
          </div>
        </div>
      </header>

      <div className="staff-app-shell mx-auto grid w-full max-w-[1440px] gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:px-8">
        <aside className="staff-app-nav h-fit lg:sticky lg:top-5">
          <div className="hidden rounded-2xl bg-[var(--bits-navy-deep)] p-4 shadow-lg lg:block">
            <p className="mb-3 px-3 text-xs leading-5 text-white/60">
              Secure access for authorized church leadership.
            </p>
            <AppShellNav groups={navGroups} />
          </div>
          <div className="lg:hidden">
            <AppShellNav groups={navGroups} />
          </div>
        </aside>

        <main className="min-w-0">{children}</main>
      </div>
      <StaffIdleTimeout
        timeoutMinutes={staffIdleTimeout.timeoutMinutes}
        warningMinutes={staffIdleTimeout.warningMinutes}
      />
    </div>
  );
}
