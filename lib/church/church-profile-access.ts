import {
  churchPersonInitials,
  churchRoster,
  churchTeamSections,
  type ChurchTeamKey,
} from "@/lib/church/team-roster";

export const CHURCH_PROFILE_TEXT_LIMITS = {
  preferredName: 80,
  aboutMe: 1000,
  familyIntroduction: 1000,
  serviceDescription: 500,
} as const;

export type ChurchProfilePublicationState = "HIDDEN" | "PUBLISHED";

export type ChurchProfileSnapshot = {
  id: string | null;
  organizationId: string;
  rosterKey: string;
  officialName: string;
  preferredName: string | null;
  aboutMe: string | null;
  familyIntroduction: string | null;
  serviceDescription: string | null;
  hasPhoto: boolean;
  shareWithMembers: boolean;
  photoShareWithMembers: boolean;
  publicConsent: boolean;
  photoPublicConsent: boolean;
  publication: ChurchProfilePublicationState;
  linkedUserAccountId: string | null;
  teams: { team: ChurchTeamKey; label: string }[];
};

export type ChurchProfileViewer = {
  organizationId: string;
  userAccountId: string;
  active: boolean;
  churchAccess: "ACTIVE" | "SUSPENDED" | "REMOVED";
  isAdmin: boolean;
};

export type PublicChurchProfile = {
  rosterKey: string;
  name: string;
  aboutMe: string | null;
  familyIntroduction: string | null;
  serviceDescription: string | null;
  teams: { team: ChurchTeamKey; label: string }[];
  photo: boolean;
};

const PUBLIC_KEYS = [
  "rosterKey",
  "name",
  "aboutMe",
  "familyIntroduction",
  "serviceDescription",
  "teams",
  "photo",
] as const;

export function publicChurchProfile(
  profile: ChurchProfileSnapshot,
): PublicChurchProfile | null {
  if (profile.publication !== "PUBLISHED" || !profile.publicConsent) return null;
  const view: PublicChurchProfile = {
    rosterKey: profile.rosterKey,
    name: profile.preferredName?.trim() || profile.officialName,
    aboutMe: blankToNull(profile.aboutMe),
    familyIntroduction: blankToNull(profile.familyIntroduction),
    serviceDescription: blankToNull(profile.serviceDescription),
    teams: profile.teams,
    photo: profile.hasPhoto && profile.photoPublicConsent,
  };
  return view;
}

export function publicChurchProfileKeys() {
  return PUBLIC_KEYS;
}

export function canReadProfilePhoto(
  profile: ChurchProfileSnapshot,
  viewer: ChurchProfileViewer | null,
) {
  if (publicChurchProfile(profile)?.photo) return true;
  if (!viewer || !viewerCanSeeChurch(profile, viewer)) return false;
  if (viewer.isAdmin || viewer.userAccountId === profile.linkedUserAccountId) {
    return profile.hasPhoto;
  }
  return (
    profile.hasPhoto &&
    profile.shareWithMembers &&
    profile.photoShareWithMembers
  );
}

export function memberChurchProfile(
  profile: ChurchProfileSnapshot,
  viewer: ChurchProfileViewer,
): ChurchProfileSnapshot | PublicChurchProfile | null {
  if (!viewerCanSeeChurch(profile, viewer)) return null;
  if (viewer.isAdmin || viewer.userAccountId === profile.linkedUserAccountId) {
    return profile;
  }
  if (!profile.shareWithMembers) return publicChurchProfile(profile);
  return {
    ...profile,
    hasPhoto: profile.hasPhoto && profile.photoShareWithMembers,
  };
}

export function canEditOwnChurchProfile(
  profile: ChurchProfileSnapshot,
  viewer: ChurchProfileViewer,
) {
  return (
    viewerCanSeeChurch(profile, viewer) &&
    viewer.userAccountId === profile.linkedUserAccountId
  );
}

export function planChurchProfilePublication(input: {
  publicConsent: boolean;
  next: ChurchProfilePublicationState;
}) {
  if (input.next === "PUBLISHED" && !input.publicConsent) {
    return { ok: false as const, reason: "CONSENT_REQUIRED" };
  }
  return { ok: true as const, publication: input.next };
}

export function planOwnPublicChoice(showPublic: boolean) {
  if (showPublic) {
    return {
      publicConsent: true,
      photoPublicConsent: true,
      publication: "PUBLISHED" as const,
    };
  }
  return {
    publicConsent: false,
    photoPublicConsent: false,
    publication: "HIDDEN" as const,
  };
}

export function planOwnProfileClaim(input: {
  confirmed: boolean;
  active: boolean;
  churchAccess: ChurchProfileViewer["churchAccess"];
  rosterKey: string;
  allowedRosterKeys: readonly string[];
  currentLinkedRosterKey: string | null;
  targetLinkedUserAccountId: string | null;
  actorUserAccountId: string;
}) {
  if (!input.active || input.churchAccess !== "ACTIVE") {
    return { ok: false as const, reason: "ACCOUNT_NOT_ACTIVE" };
  }
  if (!input.confirmed) {
    return { ok: false as const, reason: "CONFIRMATION_REQUIRED" };
  }
  if (!input.allowedRosterKeys.includes(input.rosterKey)) {
    return { ok: false as const, reason: "UNKNOWN_PROFILE" };
  }
  if (
    input.currentLinkedRosterKey &&
    input.currentLinkedRosterKey !== input.rosterKey
  ) {
    return { ok: false as const, reason: "ALREADY_LINKED" };
  }
  if (
    input.targetLinkedUserAccountId &&
    input.targetLinkedUserAccountId !== input.actorUserAccountId
  ) {
    return { ok: false as const, reason: "OWNED_BY_SOMEONE_ELSE" };
  }
  if (input.targetLinkedUserAccountId !== input.actorUserAccountId) {
    return { ok: false as const, reason: "UNVERIFIED_CLAIM" };
  }
  return { ok: true as const, rosterKey: input.rosterKey };
}

export function personalProfileKey(userAccountId: string) {
  return `account-${userAccountId}`;
}

/** A new sign-in gets a private profile. It never claims a roster card. */
export function planPersonalProfileSetup(input: {
  organizationId: string | null;
  churchClosed: boolean;
  existingLinkedRosterKey: string | null;
  userAccountId: string;
}) {
  if (input.churchClosed) {
    return { action: "skip" as const, reason: "CHURCH_CLOSED" as const };
  }
  if (!input.organizationId) {
    return { action: "skip" as const, reason: "NO_CHURCH" as const };
  }
  if (input.existingLinkedRosterKey) {
    return {
      action: "reuse" as const,
      rosterKey: input.existingLinkedRosterKey,
    };
  }
  return {
    action: "create" as const,
    rosterKey: personalProfileKey(input.userAccountId),
    publication: "HIDDEN" as const,
  };
}

export function planPhotoChange(input: {
  actorUserAccountId: string;
  actorActive: boolean;
  rosterKey: string;
  memberships: {
    organizationId: string;
    active: boolean;
    churchAccess: ChurchProfileViewer["churchAccess"];
    isAdmin: boolean;
  }[];
  profiles: {
    organizationId: string;
    rosterKey: string;
    linkedUserAccountId: string | null;
  }[];
  portalOrganizationId: string | null;
  publicOrganizationId: string | null;
  knownRosterKeys: string[];
}) {
  if (!input.actorActive) {
    return { ok: false as const, reason: "INACTIVE" as const };
  }
  const openMemberships = input.memberships.filter(
    (membership) => membership.active && membership.churchAccess === "ACTIVE",
  );
  for (const membership of openMemberships) {
    const profile = input.profiles.find(
      (item) =>
        item.organizationId === membership.organizationId &&
        item.rosterKey === input.rosterKey,
    );
    if (!profile) continue;
    const owns = profile.linkedUserAccountId === input.actorUserAccountId;
    if (membership.isAdmin || owns) {
      return {
        ok: true as const,
        action: "update" as const,
        organizationId: membership.organizationId,
      };
    }
  }
  if (input.portalOrganizationId) {
    const closed = input.memberships.some(
      (membership) =>
        membership.organizationId === input.portalOrganizationId &&
        (!membership.active || membership.churchAccess !== "ACTIVE"),
    );
    const profile = input.profiles.find(
      (item) =>
        item.organizationId === input.portalOrganizationId &&
        item.rosterKey === input.rosterKey,
    );
    if (
      !closed &&
      profile?.linkedUserAccountId === input.actorUserAccountId
    ) {
      return {
        ok: true as const,
        action: "update" as const,
        organizationId: input.portalOrganizationId,
      };
    }
  }
  const existingPublic = input.profiles.some(
    (item) =>
      item.organizationId === input.publicOrganizationId &&
      item.rosterKey === input.rosterKey,
  );
  const adminOfPublic = openMemberships.some(
    (membership) =>
      membership.organizationId === input.publicOrganizationId &&
      membership.isAdmin,
  );
  if (
    adminOfPublic &&
    input.publicOrganizationId &&
    input.knownRosterKeys.includes(input.rosterKey) &&
    !existingPublic
  ) {
    return {
      ok: true as const,
      action: "create-hidden" as const,
      organizationId: input.publicOrganizationId,
      linkedUserAccountId: null,
      publication: "HIDDEN" as const,
    };
  }
  return { ok: false as const, reason: "UNAUTHORIZED" as const };
}

export function planChurchProfileLink(input: {
  organizationId: string;
  accountOrganizationId: string;
  accountActive: boolean;
  churchAccess: ChurchProfileViewer["churchAccess"];
  explicitUserAccountId: string;
  confirmed: boolean;
  lookup: "id" | "email" | "name";
}) {
  if (input.lookup !== "id") {
    return { ok: false as const, reason: "LINK_REQUIRES_EXPLICIT_ACCOUNT" };
  }
  if (!/^[0-9a-f-]{36}$/i.test(input.explicitUserAccountId)) {
    return { ok: false as const, reason: "ACCOUNT_ID_REQUIRED" };
  }
  if (!input.confirmed) {
    return { ok: false as const, reason: "LINK_REQUIRES_CONFIRMATION" };
  }
  if (input.organizationId !== input.accountOrganizationId) {
    return { ok: false as const, reason: "CROSS_CHURCH" };
  }
  if (!input.accountActive || input.churchAccess !== "ACTIVE") {
    return { ok: false as const, reason: "ACCOUNT_NOT_ACTIVE" };
  }
  return { ok: true as const, userAccountId: input.explicitUserAccountId };
}

export function securityRoleForChurchTeam(team: ChurchTeamKey): null {
  if (team === "leadership" || team === "board" || team === "music") return null;
  return null;
}

export type ChurchTeamCardPerson = {
  key: string;
  name: string;
  initials: string;
  roleLabel: string;
  href: string | null;
  photoUrl: string | null;
  selfHref?: string | null;
  selfLabel?: string | null;
  canEditPhoto?: boolean;
  editorHasPhoto?: boolean;
};

export function buildChurchTeamCards(stored: ChurchProfileSnapshot[]) {
  const storedByKey = new Map(stored.map((profile) => [profile.rosterKey, profile]));
  const rosterKeys = new Set(churchRoster().map((person) => person.key));
  return churchTeamSections().map((section) => {
    const rosterPeople = section.people.filter((person) => {
      const row = storedByKey.get(person.key);
      if (!row) return true;
      return row.teams.some((team) => team.team === section.team);
    });
    const extras = stored.filter(
      (profile) =>
        !rosterKeys.has(profile.rosterKey) &&
        profile.teams.some((team) => team.team === section.team) &&
        publicChurchProfile(profile),
    );
    const people: ChurchTeamCardPerson[] = [
      ...rosterPeople.map((person) => cardFor(person.key, person.officialName, section.heading, storedByKey.get(person.key))),
      ...extras.map((profile) =>
        cardFor(profile.rosterKey, profile.officialName, section.heading, profile),
      ),
    ];
    return {
      team: section.team,
      heading: section.heading,
      headingId: section.headingId,
      people,
    };
  });
}

export function publicUnassignedCards(stored: ChurchProfileSnapshot[]) {
  return stored.flatMap((profile) => {
    if (profile.teams.length > 0) return [];
    const published = publicChurchProfile(profile);
    if (!published) return [];
    return [
      cardFor(profile.rosterKey, published.name, "Public profile", profile),
    ];
  });
}

function cardFor(
  key: string,
  officialName: string,
  roleLabel: string,
  profile: ChurchProfileSnapshot | undefined,
): ChurchTeamCardPerson {
  const published = profile ? publicChurchProfile(profile) : null;
  return {
    key,
    name: officialName,
    initials: churchPersonInitials(officialName),
    roleLabel,
    href: published ? `/church-leadership/${key}` : null,
    photoUrl: published?.photo ? `/api/church-profile-photo/${key}` : null,
  };
}

export function cleanProfileText(
  value: string | null | undefined,
  limit: number,
) {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (text.length > limit) return { error: `Use ${limit} characters or fewer.` };
  return text;
}

function viewerCanSeeChurch(
  profile: ChurchProfileSnapshot,
  viewer: ChurchProfileViewer,
) {
  return (
    viewer.organizationId === profile.organizationId &&
    viewer.active &&
    viewer.churchAccess === "ACTIVE"
  );
}

function blankToNull(value: string | null) {
  const text = value?.trim() ?? "";
  return text ? text : null;
}
