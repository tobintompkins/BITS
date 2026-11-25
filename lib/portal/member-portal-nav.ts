export type MemberPortalNavItem = {
  href: string;
  label: string;
  description?: string;
};

export type MemberPortalNavGroup = {
  heading: string;
  description: string;
  items: MemberPortalNavItem[];
};

export const MEMBER_PORTAL_NAV_GROUPS: MemberPortalNavGroup[] = [
  {
    heading: "Giving",
    description: "Give and review your own recorded gifts and statements.",
    items: [
      {
        href: "/portal/give",
        label: "Give Online",
        description:
          "Give a tithe or offering through Stripe’s secure checkout.",
      },
      {
        href: "/portal/gifts",
        label: "My Giving History",
        description: "Review your recorded gifts by year and fund.",
      },
      {
        href: "/portal/statements",
        label: "My Statements",
        description:
          "Open published contribution statements when they are available.",
      },
    ],
  },
  {
    heading: "Church Life",
    description: "See your church activity, service schedule, training, and resources.",
    items: [
      {
        href: "/portal/events",
        label: "My Event Registrations",
        description:
          "Review event registrations created with your signed-in account.",
      },
      {
        href: "/portal/announcements",
        label: "Church Announcements",
        description: "Read published notes from church leadership.",
      },
      {
        href: "/portal/prayer-requests",
        label: "My Prayer Requests",
        description:
          "Review prayer requests connected to your membership record.",
      },
      {
        href: "/portal/ministries",
        label: "My Ministries",
        description:
          "Review the church ministries assigned to your membership record.",
      },
      {
        href: "/portal/attendance",
        label: "My Attendance",
        description: "Review your recent church attendance.",
      },
      {
        href: "/portal/milestones",
        label: "My Milestones",
        description:
          "Review baptism, membership, and other recorded church milestones.",
      },
      {
        href: "/portal/volunteer-profile",
        label: "My Volunteer Profile",
        description:
          "Review the ministry gifts, skills, and interests recorded for you.",
      },
      {
        href: "/portal/volunteer-availability",
        label: "My Availability",
        description:
          "Share your general weekly availability for volunteer planning.",
      },
      {
        href: "/portal/volunteer-schedule",
        label: "My Service Schedule",
        description:
          "See the upcoming church events you have been asked to serve.",
      },
      {
        href: "/portal/training",
        label: "My Training",
        description:
          "See your recorded training and anything due for renewal.",
      },
      {
        href: "/portal/resources",
        label: "My Ministry Resources",
        description:
          "Open the published links for ministries you serve.",
      },
      {
        href: "/portal/volunteer-time-off",
        label: "Request Time Off",
        description:
          "Tell church leadership when you cannot serve—for example, during a vacation. A request does not cancel current assignments.",
      },
    ],
  },
  {
    heading: "My Account",
    description: "Update your profile, contact details, and sign-in settings.",
    items: [
      {
        href: "/portal/account",
        label: "My Account",
        description: "Start here for your profile, contacts, and sign-in settings.",
      },
      {
        href: "/portal/profile",
        label: "My Profile",
        description:
          "Update your photo, introduction, and who can see your church profile. Church roles stay with the church.",
      },
      {
        href: "/portal/household",
        label: "Contact & Family",
        description:
          "Review your household connection. Email and phone stay on My Profile. This does not open another adult’s profile or children’s information.",
      },
      {
        href: "/portal/emergency-contacts",
        label: "Emergency Contacts",
        description:
          "Review the emergency contacts recorded on your membership. This page is read-only.",
      },
      {
        href: "/portal/documents",
        label: "My Documents",
        description:
          "Download safe, non-confidential documents assigned to your membership.",
      },
      {
        href: "/portal/communication-preferences",
        label: "Communication Preferences",
        description:
          "Choose how the church may contact you by email, text, phone, or mail.",
      },
      {
        href: "/portal/communication-history",
        label: "Communication History",
        description:
          "Review your recorded communication and privacy preference changes.",
      },
      {
        href: "/portal/privacy",
        label: "Privacy & Data",
        description:
          "Ask the church office for a copy of your BITS information or a contact correction.",
      },
      {
        href: "/portal/help",
        label: "Help & Contact",
        description:
          "Find common BITS tasks and reach the church office when you need staff help.",
      },
    ],
  },
];

export const MEMBER_PORTAL_PENDING_LINKS: MemberPortalNavItem[] = [
  { href: "/portal/announcements", label: "Church Announcements" },
  { href: "/portal/help", label: "Help & Contact" },
  { href: "/", label: "Church Home" },
];

export function listMemberPortalNavItems() {
  return MEMBER_PORTAL_NAV_GROUPS.flatMap((group) => group.items);
}

export function isMemberPortalNavActive(pathname: string, href: string) {
  const route = href.split("?")[0];
  if (route === "/portal") return pathname === "/portal";
  if (route === "/") return pathname === "/";
  return pathname === route || pathname.startsWith(`${route}/`);
}
