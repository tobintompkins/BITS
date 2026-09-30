import {
  memberHelpTelHref,
  sanitizeMemberHelpEmail,
  sanitizeMemberHelpPhone,
  sanitizeMemberHelpWebsite,
} from "@/lib/validation/member-portal-help";

export const LEADERSHIP_HELP_HREF = "/help/leadership";

export const LEADERSHIP_HELP_SUBTITLE =
  "Simple guides for using BITS in daily church ministry.";

export const LEADERSHIP_HELP_CONTACT_FALLBACK =
  "Church office contact details are not listed here. Please speak with the church office or pastor if you need help.";

export const LEADERSHIP_HELP_NOT_YET = [
  "BITS does not send text messages or email from these leadership pages.",
  "BITS does not create or verify backups automatically.",
  "BITS does not automatically delete church records from data-retention policies.",
] as const;

export type LeadershipHelpLink = {
  href: string;
  label: string;
};

export type LeadershipHelpCard = {
  id: string;
  title: string;
  summary: string;
  links: LeadershipHelpLink[];
};

export type LeadershipHelpCapabilities = {
  canViewMembers: boolean;
  canViewPrayerRequests: boolean;
  canViewPastoralCare: boolean;
  canViewEvents: boolean;
  canViewAttendance: boolean;
  canViewGiving: boolean;
  canViewStatements: boolean;
  canViewMinistries: boolean;
  canManageMinistryRosters: boolean;
  canManageAnnouncements: boolean;
  canEditOrganization: boolean;
};

export type LeadershipHelpContact = {
  displayName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  websiteUrl: string | null;
};

export type LeadershipHelpNavItem = {
  href: string;
  label: string;
};

export function leadershipHelpNavItems(): LeadershipHelpNavItem[] {
  return [{ href: LEADERSHIP_HELP_HREF, label: "Leadership Help Center" }];
}

export function leadershipHelpTelHref(phone: string) {
  return memberHelpTelHref(phone);
}

export function selectLeadershipHelpContact(input: {
  name?: string | null;
  displayName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  websiteUrl?: string | null;
  ein?: string | null;
  slug?: string | null;
  clerkOrganizationId?: string | null;
  statementFooterText?: string | null;
}): LeadershipHelpContact {
  const name = input.name?.trim() || "the church";
  return {
    displayName: input.displayName?.trim() || name,
    contactEmail: sanitizeMemberHelpEmail(input.contactEmail),
    contactPhone: sanitizeMemberHelpPhone(input.contactPhone),
    websiteUrl: sanitizeMemberHelpWebsite(input.websiteUrl),
  };
}

export function hasLeadershipHelpContact(contact: LeadershipHelpContact) {
  return Boolean(
    contact.contactEmail || contact.contactPhone || contact.websiteUrl,
  );
}

function card(
  id: string,
  title: string,
  summary: string,
  links: LeadershipHelpLink[],
): LeadershipHelpCard | null {
  if (links.length === 0) return null;
  return { id, title, summary, links: links.slice(0, 2) };
}

export function buildLeadershipHelpCards(
  access: LeadershipHelpCapabilities,
): LeadershipHelpCard[] {
  const people = card(
    "people",
    "People & Households",
    "Look up members and households when you need a church record.",
    access.canViewMembers
      ? [
          { href: "/members", label: "Members" },
          { href: "/households", label: "Households" },
        ]
      : [],
  );

  const careLinks: LeadershipHelpLink[] = [];
  if (access.canViewPrayerRequests) {
    careLinks.push({ href: "/prayer-requests", label: "Prayer Requests" });
  }
  if (access.canViewPastoralCare) {
    careLinks.push({ href: "/pastoral-care", label: "Pastoral Care" });
  }
  const care = card(
    "care",
    "Prayer & Pastoral Care",
    "Record prayer needs and pastoral follow-through for the church family.",
    careLinks,
  );

  const eventLinks: LeadershipHelpLink[] = [];
  if (access.canViewEvents) {
    eventLinks.push({ href: "/events", label: "Events" });
  }
  if (access.canViewAttendance) {
    eventLinks.push({ href: "/attendance", label: "Attendance" });
  } else if (access.canViewEvents) {
    eventLinks.push({ href: "/events/calendar", label: "Calendar" });
  }
  const events = card(
    "events",
    "Events, Calendar & Attendance",
    "Plan gatherings and see who was present.",
    eventLinks,
  );

  const givingLinks: LeadershipHelpLink[] = [];
  if (access.canViewGiving) {
    givingLinks.push({ href: "/donors", label: "Donors" });
  }
  if (access.canViewStatements) {
    givingLinks.push({ href: "/statements", label: "Statements & Online Giving" });
  }
  const giving = card(
    "giving",
    "Giving & Statements",
    "Review donor records and contribution statements when your role allows it.",
    givingLinks,
  );

  const volunteerLinks: LeadershipHelpLink[] = [];
  if (access.canManageMinistryRosters) {
    volunteerLinks.push({
      href: "/volunteer-schedules",
      label: "Volunteer Schedules",
    });
    volunteerLinks.push({
      href: "/volunteer-training",
      label: "Volunteer Training",
    });
  } else if (access.canViewMinistries) {
    volunteerLinks.push({ href: "/ministries", label: "Ministries" });
  }
  const volunteers = card(
    "volunteers",
    "Volunteer Schedules & Training",
    "See serving assignments and training records for your ministry teams.",
    volunteerLinks,
  );

  const facilities = card(
    "facilities",
    "Equipment, Maintenance & Facilities",
    "Track church equipment, rooms, and repair needs.",
    access.canViewEvents
      ? [
          { href: "/equipment", label: "Equipment Inventory" },
          { href: "/maintenance-requests", label: "Maintenance Requests" },
        ]
      : [],
  );

  const announcements = card(
    "announcements",
    "Church Announcements & Service Alerts",
    "Share internal announcements and publish a public service notice when needed.",
    access.canManageAnnouncements
      ? [
          { href: "/announcements", label: "Church Announcements" },
          { href: "/service-alerts", label: "Church Service Alerts" },
        ]
      : [],
  );

  const administration = card(
    "administration",
    "Administration, Documents, Security, Backups, Exports, and Retention",
    "Use administrator tools for church documents, security review, exports, and retention guidance.",
    access.canEditOrganization
      ? [
          { href: "/leadership-documents", label: "Leadership Documents" },
          {
            href: "/administration/backup-readiness",
            label: "Backup & Restore Readiness",
          },
        ]
      : [],
  );

  return [
    people,
    care,
    events,
    giving,
    volunteers,
    facilities,
    announcements,
    administration,
  ].filter((item): item is LeadershipHelpCard => item != null);
}
