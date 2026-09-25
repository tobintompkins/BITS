import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import { ChurchLeadershipCard } from "@/components/home/church-leadership-card";
import {
  CHURCH_LEADERSHIP_HEADING,
  CHURCH_LEADERSHIP_NAMES,
} from "@/lib/church/leadership";
import {
  MEMBER_PORTAL_NAV_GROUPS,
  isMemberPortalNavActive,
  listMemberPortalNavItems,
} from "@/lib/portal/member-portal-nav";

const expectedRoutes = [
  { heading: "Giving", href: "/portal/give", label: "Give Online" },
  { heading: "Giving", href: "/portal/gifts", label: "My Giving History" },
  { heading: "Giving", href: "/portal/statements", label: "My Statements" },
  { heading: "Giving", href: "/portal/household", label: "My Household" },
  {
    heading: "Church Life",
    href: "/portal/events",
    label: "My Event Registrations",
  },
  {
    heading: "Church Life",
    href: "/portal/announcements",
    label: "Church Announcements",
  },
  {
    heading: "Church Life",
    href: "/portal/prayer-requests",
    label: "My Prayer Requests",
  },
  { heading: "Church Life", href: "/portal/ministries", label: "My Ministries" },
  {
    heading: "Church Life",
    href: "/portal/attendance",
    label: "My Attendance",
  },
  {
    heading: "Church Life",
    href: "/portal/milestones",
    label: "My Milestones",
  },
  {
    heading: "Church Life",
    href: "/portal/volunteer-profile",
    label: "My Volunteer Profile",
  },
  {
    heading: "Church Life",
    href: "/portal/volunteer-availability",
    label: "My Availability",
  },
  {
    heading: "Church Life",
    href: "/portal/volunteer-schedule",
    label: "My Service Schedule",
  },
  {
    heading: "Church Life",
    href: "/portal/volunteer-time-off",
    label: "Request Time Off",
  },
  {
    heading: "My Account",
    href: "/portal/profile",
    label: "My Profile & Preferences",
  },
  {
    heading: "My Account",
    href: "/portal/communication-preferences",
    label: "Communication Preferences",
  },
  { heading: "My Account", href: "/portal/privacy", label: "Privacy & Data" },
  { heading: "My Account", href: "/portal/help", label: "Help & Contact" },
];

describe("member portal navigation groups", () => {
  it("uses the approved group headings in order", () => {
    expect(MEMBER_PORTAL_NAV_GROUPS.map((group) => group.heading)).toEqual([
      "Giving",
      "Church Life",
      "My Account",
    ]);
  });

  it("includes every existing portal route exactly once in the right group", () => {
    const items = listMemberPortalNavItems();
    expect(items.map((item) => item.href)).toEqual(
      expectedRoutes.map((item) => item.href),
    );
    expect(new Set(items.map((item) => item.href)).size).toBe(items.length);

    for (const expected of expectedRoutes) {
      const group = MEMBER_PORTAL_NAV_GROUPS.find(
        (item) => item.heading === expected.heading,
      );
      expect(group?.items.some((item) => item.href === expected.href)).toBe(
        true,
      );
      expect(group?.items.some((item) => item.label === expected.label)).toBe(
        true,
      );
    }
  });

  it("marks the selected page without treating Home as a prefix match", () => {
    expect(isMemberPortalNavActive("/portal", "/portal")).toBe(true);
    expect(isMemberPortalNavActive("/portal/gifts", "/portal")).toBe(false);
    expect(isMemberPortalNavActive("/portal/gifts", "/portal/gifts")).toBe(true);
    expect(isMemberPortalNavActive("/portal/gifts/abc", "/portal/gifts")).toBe(
      true,
    );
    expect(isMemberPortalNavActive("/portal/statements", "/portal/gifts")).toBe(
      false,
    );
  });
});

describe("church leadership public card", () => {
  it("renders the approved names on the public home card", () => {
    expect(CHURCH_LEADERSHIP_HEADING).toBe("Church Leadership");
    expect(CHURCH_LEADERSHIP_NAMES).toEqual([
      "Pastor Jeff Legere",
      "Marry Legere",
    ]);

    const html = renderToStaticMarkup(createElement(ChurchLeadershipCard));
    expect(html).toContain("Church Leadership");
    expect(html).toContain("Pastor Jeff Legere");
    expect(html).toContain("Marry Legere");
    expect(html).not.toContain("bio");
    expect(html).not.toContain("http");
  });
});
