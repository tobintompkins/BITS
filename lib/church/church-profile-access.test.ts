import { describe, expect, it } from "vitest";

import {
  buildChurchTeamCards,
  canEditOwnChurchProfile,
  canReadProfilePhoto,
  cleanProfileText,
  memberChurchProfile,
  planChurchProfileLink,
  planChurchProfilePublication,
  planOwnProfileClaim,
  planOwnPublicChoice,
  publicChurchProfile,
  publicChurchProfileKeys,
  securityRoleForChurchTeam,
  type ChurchProfileSnapshot,
} from "@/lib/church/church-profile-access";
import { churchRoster, churchTeamSections } from "@/lib/church/team-roster";

const ORG = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const OWNER = "00000000-0000-4000-8000-0000000000aa";

function profile(
  overrides: Partial<ChurchProfileSnapshot> = {},
): ChurchProfileSnapshot {
  return {
    id: "00000000-0000-4000-8000-0000000000cc",
    organizationId: ORG,
    rosterKey: "casey-helmuth",
    officialName: "Casey Helmuth",
    preferredName: null,
    aboutMe: "I sing with the team.",
    familyIntroduction: "Our family attends together.",
    serviceDescription: "I help with music.",
    hasPhoto: true,
    shareWithMembers: false,
    photoShareWithMembers: false,
    publicConsent: false,
    photoPublicConsent: false,
    publication: "HIDDEN",
    linkedUserAccountId: OWNER,
    teams: [
      { team: "leadership", label: "Church Leadership" },
      { team: "board", label: "Church Board" },
      { team: "music", label: "Music Team" },
    ],
    ...overrides,
  };
}

const member = {
  organizationId: ORG,
  userAccountId: "00000000-0000-4000-8000-0000000000bb",
  active: true,
  churchAccess: "ACTIVE" as const,
  isAdmin: false,
};

describe("church roster", () => {
  it("keeps one profile for Casey and adds the board beside Terry", () => {
    const people = churchRoster();
    const keys = people.map((person) => person.key);
    expect(new Set(keys).size).toBe(keys.length);
    const casey = people.find((person) => person.key === "casey-helmuth");
    expect(casey?.teams.map((team) => team.team)).toEqual([
      "leadership",
      "board",
      "music",
    ]);
    const board = churchTeamSections().find((section) => section.team === "board");
    expect(board?.people.map((person) => person.officialName)).toEqual([
      "Terry Tompkins",
      "Casey Helmuth",
    ]);
    expect(people.map((person) => person.officialName)).toEqual([
      "Pastor Jeff Legere",
      "Marry Legere",
      "Casey Helmuth",
      "Shelia Helmuth",
      "Terry Tompkins",
      "Tami Tompkins",
      "Tobin Tompkins",
    ]);
  });

  it("does not turn a church team into a security role", () => {
    expect(securityRoleForChurchTeam("board")).toBeNull();
    expect(securityRoleForChurchTeam("music")).toBeNull();
    expect(securityRoleForChurchTeam("leadership")).toBeNull();
  });
});

describe("church profile visibility", () => {
  it("keeps a team listing private until consent and publication", () => {
    expect(publicChurchProfile(profile())).toBeNull();
    expect(
      publicChurchProfile(profile({ publicConsent: true, publication: "HIDDEN" })),
    ).toBeNull();
  });

  it("publishes only approved text and a photo that was separately allowed", () => {
    const view = publicChurchProfile(
      profile({ publicConsent: true, publication: "PUBLISHED" }),
    );
    expect(view?.photo).toBe(false);
    expect(Object.keys(view ?? {}).sort()).toEqual(
      [...publicChurchProfileKeys()].sort(),
    );
    expect(JSON.stringify(view)).not.toMatch(/address|birth|gift|statement|@/i);
    const withPhoto = publicChurchProfile(
      profile({
        publicConsent: true,
        photoPublicConsent: true,
        publication: "PUBLISHED",
      }),
    );
    expect(withPhoto?.photo).toBe(true);
  });

  it("denies another church, a suspended member, and an unshared biography", () => {
    const row = profile({ shareWithMembers: true });
    expect(
      memberChurchProfile(row, { ...member, organizationId: OTHER }),
    ).toBeNull();
    expect(
      memberChurchProfile(row, { ...member, churchAccess: "SUSPENDED" }),
    ).toBeNull();
    expect(
      memberChurchProfile(row, { ...member, churchAccess: "REMOVED" }),
    ).toBeNull();
    const hidden = memberChurchProfile(profile(), member);
    expect(hidden).toBeNull();
  });

  it("lets the owner edit personal text and keeps the photo private from other members", () => {
    const row = profile({ shareWithMembers: true, photoShareWithMembers: false });
    expect(canEditOwnChurchProfile(row, { ...member, userAccountId: OWNER })).toBe(
      true,
    );
    expect(canEditOwnChurchProfile(row, member)).toBe(false);
    const shared = memberChurchProfile(row, member);
    expect(shared && "aboutMe" in shared ? shared.aboutMe : null).toBe(
      "I sing with the team.",
    );
    expect(shared && "hasPhoto" in shared ? shared.hasPhoto : true).toBe(false);
    expect(canReadProfilePhoto(row, null)).toBe(false);
    expect(canReadProfilePhoto(row, { ...member, userAccountId: OWNER })).toBe(
      true,
    );
  });

  it("requires explicit account confirmation and blocks name or email matching", () => {
    expect(
      planChurchProfileLink({
        organizationId: ORG,
        accountOrganizationId: ORG,
        accountActive: true,
        churchAccess: "ACTIVE",
        explicitUserAccountId: OWNER,
        confirmed: true,
        lookup: "email",
      }).ok,
    ).toBe(false);
    expect(
      planChurchProfileLink({
        organizationId: ORG,
        accountOrganizationId: ORG,
        accountActive: true,
        churchAccess: "ACTIVE",
        explicitUserAccountId: OWNER,
        confirmed: true,
        lookup: "name",
      }).ok,
    ).toBe(false);
    expect(
      planChurchProfileLink({
        organizationId: ORG,
        accountOrganizationId: OTHER,
        accountActive: true,
        churchAccess: "ACTIVE",
        explicitUserAccountId: OWNER,
        confirmed: true,
        lookup: "id",
      }),
    ).toMatchObject({ ok: false, reason: "CROSS_CHURCH" });
    expect(
      planChurchProfilePublication({ publicConsent: false, next: "PUBLISHED" }),
    ).toMatchObject({ ok: false, reason: "CONSENT_REQUIRED" });
    expect(cleanProfileText("  Hello   there ", 20)).toBe("Hello there");
    expect(planOwnPublicChoice(true)).toMatchObject({
      publicConsent: true,
      photoPublicConsent: true,
      publication: "PUBLISHED",
    });
    expect(planOwnPublicChoice(false).publication).toBe("HIDDEN");
    expect(
      planOwnProfileClaim({
        confirmed: true,
        active: true,
        churchAccess: "ACTIVE",
        rosterKey: "casey-helmuth",
        allowedRosterKeys: ["casey-helmuth"],
        currentLinkedRosterKey: null,
        targetLinkedUserAccountId: null,
        actorUserAccountId: OWNER,
      }).ok,
    ).toBe(true);
    expect(
      planOwnProfileClaim({
        confirmed: false,
        active: true,
        churchAccess: "ACTIVE",
        rosterKey: "casey-helmuth",
        allowedRosterKeys: ["casey-helmuth"],
        currentLinkedRosterKey: null,
        targetLinkedUserAccountId: null,
        actorUserAccountId: OWNER,
      }),
    ).toMatchObject({ ok: false, reason: "CONFIRMATION_REQUIRED" });
    expect(
      planOwnProfileClaim({
        confirmed: true,
        active: true,
        churchAccess: "SUSPENDED",
        rosterKey: "casey-helmuth",
        allowedRosterKeys: ["casey-helmuth"],
        currentLinkedRosterKey: null,
        targetLinkedUserAccountId: null,
        actorUserAccountId: OWNER,
      }),
    ).toMatchObject({ ok: false, reason: "ACCOUNT_NOT_ACTIVE" });
    expect(
      planOwnProfileClaim({
        confirmed: true,
        active: true,
        churchAccess: "ACTIVE",
        rosterKey: "pastor-jeff-legere",
        allowedRosterKeys: ["pastor-jeff-legere"],
        currentLinkedRosterKey: "casey-helmuth",
        targetLinkedUserAccountId: null,
        actorUserAccountId: OWNER,
      }),
    ).toMatchObject({ ok: false, reason: "ALREADY_LINKED" });
    expect(
      planOwnProfileClaim({
        confirmed: true,
        active: true,
        churchAccess: "ACTIVE",
        rosterKey: "casey-helmuth",
        allowedRosterKeys: ["casey-helmuth"],
        currentLinkedRosterKey: null,
        targetLinkedUserAccountId: "00000000-0000-4000-8000-0000000000bb",
        actorUserAccountId: OWNER,
      }),
    ).toMatchObject({ ok: false, reason: "OWNED_BY_SOMEONE_ELSE" });
    expect(
      canEditOwnChurchProfile(profile(), {
        organizationId: ORG,
        userAccountId: OWNER,
        active: true,
        churchAccess: "ACTIVE",
        isAdmin: false,
      }),
    ).toBe(true);
  });

  it("does not turn a private photo into a public team card", () => {
    const cards = buildChurchTeamCards([
      profile({ publicConsent: true, publication: "PUBLISHED" }),
    ]);
    const board = cards.find((section) => section.team === "board");
    const casey = board?.people.find((person) => person.key === "casey-helmuth");
    expect(casey?.photoUrl).toBeNull();
    expect(casey?.href).toBe("/church-leadership/casey-helmuth");
    expect(casey?.name).toBe("Casey Helmuth");
    const hidden = buildChurchTeamCards([profile()]);
    expect(
      hidden
        .flatMap((section) => section.people)
        .find((person) => person.key === "casey-helmuth")?.href,
    ).toBeNull();
  });
});
