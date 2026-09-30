import { describe, expect, it } from "vitest";

import {
  LEADERSHIP_HELP_CONTACT_FALLBACK,
  LEADERSHIP_HELP_NOT_YET,
  buildLeadershipHelpCards,
  hasLeadershipHelpContact,
  leadershipHelpNavItems,
  selectLeadershipHelpContact,
  type LeadershipHelpCapabilities,
} from "./leadership-help";

const none: LeadershipHelpCapabilities = {
  canViewMembers: false,
  canViewPrayerRequests: false,
  canViewPastoralCare: false,
  canViewEvents: false,
  canViewAttendance: false,
  canViewGiving: false,
  canViewStatements: false,
  canViewMinistries: false,
  canManageMinistryRosters: false,
  canManageAnnouncements: false,
  canEditOrganization: false,
};

function access(
  overrides: Partial<LeadershipHelpCapabilities> = {},
): LeadershipHelpCapabilities {
  return { ...none, ...overrides };
}

function hrefs(cards: ReturnType<typeof buildLeadershipHelpCards>) {
  return cards.flatMap((card) => card.links.map((link) => link.href));
}

describe("leadership help navigation", () => {
  it("is available to signed-in staff", () => {
    expect(leadershipHelpNavItems()).toEqual([
      { href: "/help/leadership", label: "Leadership Help Center" },
    ]);
  });
});

describe("buildLeadershipHelpCards", () => {
  it("omits inaccessible routes for a lower-access role", () => {
    const cards = buildLeadershipHelpCards(
      access({
        canViewMembers: true,
        canViewPrayerRequests: true,
        canViewMinistries: true,
      }),
    );
    const links = hrefs(cards);
    expect(links).toEqual([
      "/members",
      "/households",
      "/prayer-requests",
      "/ministries",
    ]);
    expect(links).not.toContain("/donors");
    expect(links).not.toContain("/statements");
    expect(links).not.toContain("/announcements");
    expect(links).not.toContain("/service-alerts");
    expect(links).not.toContain("/leadership-documents");
    expect(links).not.toContain("/administration/backup-readiness");
    expect(links).not.toContain("/administration/data-export");
    expect(cards.map((card) => card.id)).not.toContain("giving");
    expect(cards.map((card) => card.id)).not.toContain("administration");
    expect(cards.map((card) => card.id)).not.toContain("announcements");
  });

  it("shows financial links only when giving permissions exist", () => {
    const dataEntry = buildLeadershipHelpCards(
      access({ canViewGiving: true, canViewStatements: false }),
    );
    expect(hrefs(dataEntry)).toEqual(["/donors"]);
    expect(hrefs(dataEntry)).not.toContain("/statements");

    const treasurer = buildLeadershipHelpCards(
      access({ canViewGiving: true, canViewStatements: true }),
    );
    expect(hrefs(treasurer)).toEqual(["/donors", "/statements"]);
  });

  it("shows administrator tools only to organization editors", () => {
    const staff = buildLeadershipHelpCards(access({ canViewMembers: true }));
    expect(hrefs(staff)).not.toContain("/leadership-documents");
    expect(hrefs(staff)).not.toContain("/administration/backup-readiness");

    const admin = buildLeadershipHelpCards(
      access({ canEditOrganization: true }),
    );
    expect(hrefs(admin)).toEqual([
      "/leadership-documents",
      "/administration/backup-readiness",
    ]);
  });

  it("does not create cards without at least one allowed link", () => {
    expect(buildLeadershipHelpCards(none)).toEqual([]);
  });

  it("includes events, facilities, and announcement links only when allowed", () => {
    const cards = buildLeadershipHelpCards(
      access({
        canViewEvents: true,
        canViewAttendance: true,
        canManageAnnouncements: true,
      }),
    );
    expect(hrefs(cards)).toEqual([
      "/events",
      "/attendance",
      "/equipment",
      "/maintenance-requests",
      "/announcements",
      "/service-alerts",
    ]);
    expect(hrefs(cards)).not.toContain("/members");
    expect(hrefs(cards)).not.toContain("/volunteer-schedules");
  });
});

describe("selectLeadershipHelpContact", () => {
  it("returns only safe email, phone, and website fields", () => {
    const contact = selectLeadershipHelpContact({
      name: "First United Pentecostal Church of Saco",
      displayName: "First UPC of Saco",
      contactEmail: "office@church.test",
      contactPhone: "(207) 555-0100",
      websiteUrl: "https://church.test",
      ein: "12-3456789",
      slug: "first-upc-saco",
      clerkOrganizationId: "org_secret",
      statementFooterText: "Internal footer",
    });
    expect(contact).toEqual({
      displayName: "First UPC of Saco",
      contactEmail: "office@church.test",
      contactPhone: "(207) 555-0100",
      websiteUrl: "https://church.test",
    });
    const payload = JSON.stringify(contact);
    expect(payload).not.toContain("12-3456789");
    expect(payload).not.toContain("org_secret");
    expect(payload).not.toContain("Internal footer");
    expect(payload).not.toContain("first-upc-saco");
    expect(contact).not.toHaveProperty("ein");
    expect(contact).not.toHaveProperty("id");
    expect(Object.keys(contact)).toEqual([
      "displayName",
      "contactEmail",
      "contactPhone",
      "websiteUrl",
    ]);
  });

  it("falls back when contact details are missing or invalid", () => {
    const contact = selectLeadershipHelpContact({
      name: "Grace Church",
      displayName: "  ",
      contactEmail: "not-an-email",
      contactPhone: "abc",
      websiteUrl: "javascript:alert(1)",
    });
    expect(contact).toEqual({
      displayName: "Grace Church",
      contactEmail: null,
      contactPhone: null,
      websiteUrl: null,
    });
    expect(hasLeadershipHelpContact(contact)).toBe(false);
    expect(LEADERSHIP_HELP_CONTACT_FALLBACK).toContain("church office");
  });

  it("does not include private member or financial values", () => {
    const cards = buildLeadershipHelpCards(
      access({ canViewGiving: true, canViewStatements: true }),
    );
    const payload = JSON.stringify({
      cards,
      notYet: LEADERSHIP_HELP_NOT_YET,
    });
    expect(payload).not.toMatch(/\$\d/);
    expect(payload).not.toMatch(/memberId/i);
    expect(payload).not.toContain("primaryEmail");
    expect(LEADERSHIP_HELP_NOT_YET).toEqual([
      "BITS does not send text messages or email from these leadership pages.",
      "BITS does not create or verify backups automatically.",
      "BITS does not automatically delete church records from data-retention policies.",
    ]);
  });
});
