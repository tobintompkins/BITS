export type MemberPortalNavItem = {
  href: string;
  label: string;
  description?: string;
};

export type MemberPortalNavGroup = {
  heading: string;
  items: MemberPortalNavItem[];
};

export const MEMBER_PORTAL_NAV_GROUPS: MemberPortalNavGroup[] = [
  {
    heading: "Giving",
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
      {
        href: "/portal/household",
        label: "My Household",
        description:
          "See your household connection and whether you are authorized to receive household statements.",
      },
    ],
  },
  {
    heading: "Church Life",
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
        href: "/portal/volunteer-time-off",
        label: "Request Time Off",
        description:
          "Ask church leadership for dates when you cannot volunteer.",
      },
    ],
  },
  {
    heading: "My Account",
    items: [
      {
        href: "/portal/profile",
        label: "My Profile & Preferences",
        description: "Update your email, phone, and preferred contact method.",
      },
      {
        href: "/portal/communication-preferences",
        label: "Communication Preferences",
        description:
          "Choose how the church may contact you by email, text, phone, or mail.",
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
  { href: "/", label: "Public Home" },
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
