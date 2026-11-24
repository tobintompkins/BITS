import { ChurchTeam, RoleCode } from "@/app/generated/prisma/client";
import {
  CHURCH_PROFILE_TEXT_LIMITS,
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
  publicUnassignedCards,
  type ChurchProfileSnapshot,
  type ChurchProfileViewer,
  type ChurchTeamCardPerson,
} from "@/lib/church/church-profile-access";
import {
  churchRoster,
  churchRosterKey,
  churchTeamLabel,
  type ChurchTeamKey,
} from "@/lib/church/team-roster";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import { prepareChurchProfilePhoto } from "@/lib/validation/church-profile-photo";
import {
  createAuditEvent,
  type CreateAuditEventInput,
} from "@/server/repositories/audit-event.repository";
import { findPublicOrganization } from "@/server/repositories/public-organization.repository";

const TEAM_TO_KEY: Record<ChurchTeam, ChurchTeamKey> = {
  LEADERSHIP: "leadership",
  BOARD: "board",
  MUSIC: "music",
};

const KEY_TO_TEAM: Record<ChurchTeamKey, ChurchTeam> = {
  leadership: ChurchTeam.LEADERSHIP,
  board: ChurchTeam.BOARD,
  music: ChurchTeam.MUSIC,
};

type ProfileRow = {
  id: string;
  organizationId: string;
  rosterKey: string;
  officialName: string;
  preferredName: string | null;
  aboutMe: string | null;
  familyIntroduction: string | null;
  serviceDescription: string | null;
  photo: Uint8Array | Buffer | null;
  photoContentType: string | null;
  shareWithMembers: boolean;
  photoShareWithMembers: boolean;
  publicConsent: boolean;
  photoPublicConsent: boolean;
  publication: "HIDDEN" | "PUBLISHED";
  linkedUserAccountId: string | null;
  assignments: { team: ChurchTeam; sortOrder: number }[];
};

function isMissingTable(error: unknown) {
  return prismaErrorCode(error) === "P2021";
}

function isUniqueConflict(error: unknown) {
  return prismaErrorCode(error) === "P2002";
}

function prismaErrorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? (error as { code?: string }).code
    : undefined;
}

const PROFILE_SAVE_ERROR = "Your profile could not be saved. Please try again.";

async function recordProfileAudit(input: CreateAuditEventInput) {
  try {
    await createAuditEvent(input);
    return null;
  } catch {
    return PROFILE_SAVE_ERROR;
  }
}

function toSnapshot(row: ProfileRow): ChurchProfileSnapshot {
  return {
    id: row.id,
    organizationId: row.organizationId,
    rosterKey: row.rosterKey,
    officialName: row.officialName,
    preferredName: row.preferredName,
    aboutMe: row.aboutMe,
    familyIntroduction: row.familyIntroduction,
    serviceDescription: row.serviceDescription,
    hasPhoto: Boolean(row.photo),
    shareWithMembers: row.shareWithMembers,
    photoShareWithMembers: row.photoShareWithMembers,
    publicConsent: row.publicConsent,
    photoPublicConsent: row.photoPublicConsent,
    publication: row.publication,
    linkedUserAccountId: row.linkedUserAccountId,
    teams: row.assignments
      .slice()
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((assignment) => ({
        team: TEAM_TO_KEY[assignment.team],
        label: churchTeamLabel(TEAM_TO_KEY[assignment.team]),
      })),
  };
}

async function loadProfiles(organizationId: string) {
  try {
    const rows = await prisma.churchPersonProfile.findMany({
      where: { organizationId },
      include: { assignments: true },
    });
    return rows.map((row) => ({ row, snapshot: toSnapshot(row as ProfileRow) }));
  } catch (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
}

export async function publicChurchTeamCards(): Promise<{
  heading: string;
  headingId: string;
  people: ChurchTeamCardPerson[];
}[]> {
  const organization = await findPublicOrganization();
  const stored = organization ? await loadProfiles(organization.id) : [];
  return buildChurchTeamCards(stored.map((item) => item.snapshot));
}

export async function publicFamilyCards(): Promise<ChurchTeamCardPerson[]> {
  const organization = await findPublicOrganization();
  const stored = organization ? await loadProfiles(organization.id) : [];
  return publicUnassignedCards(stored.map((item) => item.snapshot));
}

export async function publicChurchProfilePage(rosterKey: string) {
  const organization = await findPublicOrganization();
  if (!organization) return null;
  const stored = await loadProfiles(organization.id);
  const match = stored.find((item) => item.snapshot.rosterKey === rosterKey);
  if (!match) return null;
  const view = publicChurchProfile(match.snapshot);
  if (!view) return null;
  return view;
}

async function viewerForAccount(organizationId: string): Promise<
  | { status: "SIGNED_OUT" }
  | { status: "FORBIDDEN" }
  | { status: "OK"; accountId: string; viewer: ChurchProfileViewer }
> {
  const account = await getOrCreateUserAccount();
  if (!account?.active) return { status: account ? "FORBIDDEN" : "SIGNED_OUT" };
  const membership = await prisma.organizationMembership.findFirst({
    where: { organizationId, userAccountId: account.id, active: true },
    include: { roleType: true },
  });
  if (!membership || membership.churchAccess !== "ACTIVE") {
    return { status: "FORBIDDEN" };
  }
  return {
    status: "OK",
    accountId: account.id,
    viewer: {
      organizationId,
      userAccountId: account.id,
      active: true,
      churchAccess: "ACTIVE",
      isAdmin: membership.roleType.code === RoleCode.ORG_ADMIN,
    },
  };
}

export async function ownChurchProfile() {
  const account = await getOrCreateUserAccount();
  if (!account) return { status: "SIGNED_OUT" as const };
  const membership = await prisma.organizationMembership.findFirst({
    where: { userAccountId: account.id, active: true, churchAccess: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) return { status: "NO_PROFILE" as const, accountName: account.displayName };
  let stored: Awaited<ReturnType<typeof loadProfiles>> = [];
  try {
    stored = await loadProfiles(membership.organizationId);
  } catch (error) {
    if (!isMissingTable(error)) throw error;
  }
  const match = stored.find(
    (item) => item.snapshot.linkedUserAccountId === account.id,
  );
  if (!match) {
    return { status: "NO_PROFILE" as const, accountName: account.displayName };
  }
  return {
    status: "READY" as const,
    profile: match.snapshot,
    officialTeams: match.snapshot.teams,
  };
}

function textField(value: FormDataEntryValue | null, limit: number) {
  const cleaned = cleanProfileText(typeof value === "string" ? value : "", limit);
  if (cleaned && typeof cleaned === "object") {
    return { ok: false as const, message: cleaned.error };
  }
  return { ok: true as const, value: cleaned };
}

export async function saveOwnChurchProfile(formData: FormData) {
  const current = await ownChurchProfile();
  if (current.status !== "READY") return { ok: false as const, message: "A church profile has not been linked to this account." };
  const viewerResult = await viewerForAccount(current.profile.organizationId);
  if (viewerResult.status !== "OK" || !canEditOwnChurchProfile(current.profile, viewerResult.viewer)) {
    return { ok: false as const, message: "You can edit only your own church profile." };
  }
  const preferred = textField(formData.get("preferredName"), CHURCH_PROFILE_TEXT_LIMITS.preferredName);
  const about = textField(formData.get("aboutMe"), CHURCH_PROFILE_TEXT_LIMITS.aboutMe);
  const family = textField(formData.get("familyIntroduction"), CHURCH_PROFILE_TEXT_LIMITS.familyIntroduction);
  const service = textField(formData.get("serviceDescription"), CHURCH_PROFILE_TEXT_LIMITS.serviceDescription);
  if (!preferred.ok) return { ok: false as const, message: preferred.message };
  if (!about.ok) return { ok: false as const, message: about.message };
  if (!family.ok) return { ok: false as const, message: family.message };
  if (!service.ok) return { ok: false as const, message: service.message };
  await prisma.churchPersonProfile.update({
    where: {
      organizationId_rosterKey: {
        organizationId: current.profile.organizationId,
        rosterKey: current.profile.rosterKey,
      },
    },
    data: {
      preferredName: preferred.value,
      aboutMe: about.value,
      familyIntroduction: family.value,
      serviceDescription: service.value,
      shareWithMembers: formData.get("shareWithMembers") === "on",
      photoShareWithMembers: formData.get("photoShareWithMembers") === "on",
      ...planOwnPublicChoice(formData.get("showPublic") === "on"),
    },
  });
  if (!current.profile.id) {
    return { ok: false as const, message: "Your profile could not be saved." };
  }
  const auditError = await recordProfileAudit({
    organizationId: current.profile.organizationId,
    actorUserAccountId: viewerResult.accountId,
    action: "CHURCH_PROFILE_UPDATE",
    entityType: "ChurchPersonProfile",
    entityId: current.profile.id,
    changes: [
      { field: "personalDescription", oldValue: null, newValue: "updated" },
      {
        field: "publication",
        oldValue: current.profile.publication,
        newValue: planOwnPublicChoice(formData.get("showPublic") === "on").publication,
      },
    ],
  });
  if (auditError) return { ok: false as const, message: auditError };
  return {
    ok: true as const,
    message: "Your profile was saved. Church teams stay with the church and do not grant administrator access.",
  };
}

async function activeMemberAccount() {
  const account = await getOrCreateUserAccount();
  if (!account?.active) return { status: account ? "FORBIDDEN" as const : "SIGNED_OUT" as const };
  const membership = await prisma.organizationMembership.findFirst({
    where: { userAccountId: account.id, active: true, churchAccess: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    include: { roleType: true },
  });
  if (!membership) return { status: "FORBIDDEN" as const };
  return { status: "OK" as const, account, membership };
}

export async function claimOwnChurchProfile(formData: FormData) {
  const access = await activeMemberAccount();
  if (access.status !== "OK") {
    return { ok: false as const, message: "Sign in with active church access to update your own profile." };
  }
  const rosterKey = churchRosterKey(String(formData.get("rosterKey") ?? ""));
  const person = churchRoster().find((item) => item.key === rosterKey);
  let stored: Awaited<ReturnType<typeof loadProfiles>> = [];
  try {
    stored = await loadProfiles(access.membership.organizationId);
  } catch (error) {
    if (!isMissingTable(error)) throw error;
    return { ok: false as const, message: "Apply the local church-profile migration before saving." };
  }
  const current = stored.find((item) => item.snapshot.linkedUserAccountId === access.account.id);
  const target = stored.find((item) => item.snapshot.rosterKey === rosterKey);
  const plan = planOwnProfileClaim({
    confirmed: formData.get("claimConfirmed") === "on",
    active: true,
    churchAccess: "ACTIVE",
    rosterKey,
    allowedRosterKeys: person ? [person.key] : [],
    currentLinkedRosterKey: current?.snapshot.rosterKey ?? null,
    targetLinkedUserAccountId: target?.snapshot.linkedUserAccountId ?? null,
    actorUserAccountId: access.account.id,
  });
  if (!plan.ok || !person) {
    return { ok: false as const, message: "Choose your own unclaimed profile and confirm that it is you." };
  }
  let profileId = target?.row.id ?? null;
  try {
    if (target) {
      await prisma.churchPersonProfile.update({
        where: { id: target.row.id },
        data: { linkedUserAccountId: access.account.id },
      });
    } else {
      const created = await prisma.churchPersonProfile.create({
        data: {
          organizationId: access.membership.organizationId,
          rosterKey: person.key,
          officialName: person.officialName,
          linkedUserAccountId: access.account.id,
          assignments: {
            create: person.teams.map((team) => ({
              team: KEY_TO_TEAM[team.team],
              sortOrder: team.sortOrder,
            })),
          },
        },
      });
      profileId = created.id;
    }
  } catch (error) {
    if (isMissingTable(error) || isUniqueConflict(error)) {
      return { ok: false as const, message: "That profile is already connected to an account." };
    }
    return { ok: false as const, message: PROFILE_SAVE_ERROR };
  }
  if (!profileId) {
    return { ok: false as const, message: "Your profile could not be saved." };
  }
  const auditError = await recordProfileAudit({
    organizationId: access.membership.organizationId,
    actorUserAccountId: access.account.id,
    action: "CHURCH_PROFILE_LINK",
    entityType: "ChurchPersonProfile",
    entityId: profileId,
    changes: [{ field: "linkedUserAccountId", oldValue: null, newValue: access.account.id }],
  });
  if (auditError) return { ok: false as const, message: auditError };
  return { ok: true as const, message: "This profile is yours. You can update the photo and description." };
}

export async function createOwnPersonalProfile() {
  const access = await activeMemberAccount();
  if (access.status !== "OK") {
    return { ok: false as const, message: "Sign in with active church access to update your own profile." };
  }
  const stored = await loadProfiles(access.membership.organizationId);
  const current = stored.find((item) => item.snapshot.linkedUserAccountId === access.account.id);
  if (current) return { ok: true as const, message: "Your profile is ready." };
  const rosterKey = `account-${access.account.id}`;
  try {
    const created = await prisma.churchPersonProfile.create({
      data: {
        organizationId: access.membership.organizationId,
        rosterKey,
        officialName: access.account.displayName?.trim() || "Church member",
        linkedUserAccountId: access.account.id,
      },
    });
    const auditError = await recordProfileAudit({
      organizationId: access.membership.organizationId,
      actorUserAccountId: access.account.id,
      action: "CHURCH_PROFILE_LINK",
      entityType: "ChurchPersonProfile",
      entityId: created.id,
      changes: [{ field: "linkedUserAccountId", oldValue: null, newValue: access.account.id }],
    });
    if (auditError) return { ok: false as const, message: auditError };
    return { ok: true as const, message: "Your profile is ready." };
  } catch (error) {
    if (isMissingTable(error)) {
      return { ok: false as const, message: "Apply the local church-profile migration before saving." };
    }
    if (isUniqueConflict(error)) return { ok: true as const, message: "Your profile is ready." };
    return { ok: false as const, message: PROFILE_SAVE_ERROR };
  }
}

function checkedTeams(formData: FormData): ChurchTeamKey[] {
  return ["leadership", "board", "music"].filter(
    (team) => formData.get(`team-${team}`) === "on",
  ) as ChurchTeamKey[];
}

export async function saveChurchProfileAsAdmin(formData: FormData) {
  const account = await getOrCreateUserAccount();
  if (!account) return { ok: false as const, message: "Sign in required." };
  const membership = await prisma.organizationMembership.findFirst({
    where: {
      userAccountId: account.id,
      active: true,
      churchAccess: "ACTIVE",
      roleType: { code: RoleCode.ORG_ADMIN },
    },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) {
    return { ok: false as const, message: "An active church administrator is required." };
  }
  const organizationId = membership.organizationId;
  const access = await viewerForAccount(organizationId);
  if (access.status !== "OK" || !access.viewer.isAdmin) {
    return { ok: false as const, message: "An active church administrator is required." };
  }
  const officialName = String(formData.get("officialName") ?? "").trim();
  const rosterKey = churchRosterKey(String(formData.get("rosterKey") ?? officialName));
  if (!officialName || !rosterKey) {
    return { ok: false as const, message: "Enter the person's name." };
  }
  const publicConsent = formData.get("publicConsent") === "on";
  const publication = planChurchProfilePublication({
    publicConsent,
    next: formData.get("publication") === "PUBLISHED" ? "PUBLISHED" : "HIDDEN",
  });
  if (!publication.ok) {
    return { ok: false as const, message: "Public profiles require the person's consent." };
  }
  const linkId = String(formData.get("linkUserAccountId") ?? "").trim();
  let linkedUserAccountId: string | null | undefined;
  if (linkId) {
    const membership = await prisma.organizationMembership.findFirst({
      where: { organizationId, userAccountId: linkId },
    });
    const plan = planChurchProfileLink({
      organizationId,
      accountOrganizationId: membership?.organizationId ?? "",
      accountActive: Boolean(membership?.active),
      churchAccess: membership?.churchAccess ?? "REMOVED",
      explicitUserAccountId: linkId,
      confirmed: formData.get("linkConfirmed") === "on",
      lookup: "id",
    });
    if (!plan.ok) {
      return { ok: false as const, message: "Link the exact active account in this church. Names and emails are not used." };
    }
    linkedUserAccountId = plan.userAccountId;
  } else if (formData.get("clearLink") === "on") {
    linkedUserAccountId = null;
  }
  const teams = checkedTeams(formData);
  const existing = await prisma.churchPersonProfile.findUnique({
    where: { organizationId_rosterKey: { organizationId, rosterKey } },
    include: { assignments: true },
  });
  let saved;
  try {
    saved = await prisma.churchPersonProfile.upsert({
    where: { organizationId_rosterKey: { organizationId, rosterKey } },
    create: {
      organizationId,
      rosterKey,
      officialName,
      publicConsent,
      photoPublicConsent: formData.get("photoPublicConsent") === "on",
      publication: publication.publication,
      shareWithMembers: false,
      photoShareWithMembers: false,
      linkedUserAccountId: linkedUserAccountId ?? null,
      assignments: {
        create: teams.map((team, sortOrder) => ({
          team: KEY_TO_TEAM[team],
          sortOrder,
        })),
      },
    },
    update: {
      officialName,
      publicConsent,
      photoPublicConsent: formData.get("photoPublicConsent") === "on",
      publication: publication.publication,
      ...(linkedUserAccountId !== undefined ? { linkedUserAccountId } : {}),
      assignments: {
        deleteMany: {},
        create: teams.map((team, sortOrder) => ({
          team: KEY_TO_TEAM[team],
          sortOrder,
        })),
      },
    },
    });
  } catch (error) {
    if (isMissingTable(error)) {
      return {
        ok: false as const,
        message: "Apply the local church-profile migration before saving.",
      };
    }
    return { ok: false as const, message: PROFILE_SAVE_ERROR };
  }
  const auditError = await recordProfileAudit({
    organizationId,
    actorUserAccountId: access.accountId,
    action: linkedUserAccountId ? "CHURCH_PROFILE_LINK" : "CHURCH_PROFILE_PUBLISH",
    entityType: "ChurchPersonProfile",
    entityId: saved.id,
    changes: [
      {
        field: "publication",
        oldValue: existing?.publication ?? null,
        newValue: publication.publication,
      },
      {
        field: "teams",
        oldValue: existing?.assignments.map((assignment) => assignment.team).join(",") || null,
        newValue: teams.join(","),
      },
      {
        field: "linkedUserAccountId",
        oldValue: existing?.linkedUserAccountId ?? null,
        newValue: saved.linkedUserAccountId,
      },
    ],
  });
  if (auditError) return { ok: false as const, message: auditError };
  return { ok: true as const, message: "Church profile saved. No login or donor record was created." };
}

export async function adminChurchProfiles(organizationId: string) {
  const access = await viewerForAccount(organizationId);
  if (access.status !== "OK" || !access.viewer.isAdmin) return { status: access.status };
  const stored = await loadProfiles(organizationId);
  const byKey = new Map(stored.map((item) => [item.snapshot.rosterKey, item.snapshot]));
  const roster = churchRoster().map((person) => byKey.get(person.key) ?? {
    id: null,
    organizationId,
    rosterKey: person.key,
    officialName: person.officialName,
    preferredName: null,
    aboutMe: null,
    familyIntroduction: null,
    serviceDescription: null,
    hasPhoto: false,
    shareWithMembers: false,
    photoShareWithMembers: false,
    publicConsent: false,
    photoPublicConsent: false,
    publication: "HIDDEN" as const,
    linkedUserAccountId: null,
    teams: person.teams.map((team) => ({ team: team.team, label: team.label })),
  });
  const extras = stored
    .map((item) => item.snapshot)
    .filter((profile) => !roster.some((person) => person.rosterKey === profile.rosterKey));
  return { status: "READY" as const, profiles: [...roster, ...extras] };
}

export async function readChurchProfilePhoto(
  rosterKey: string,
  viewer: ChurchProfileViewer | null,
) {
  const organization = await findPublicOrganization();
  const organizationId = viewer?.organizationId ?? organization?.id;
  if (!organizationId) return null;
  const stored = await loadProfiles(organizationId);
  const match = stored.find((item) => item.snapshot.rosterKey === rosterKey);
  if (!match?.row.photo || !canReadProfilePhoto(match.snapshot, viewer)) return null;
  return {
    bytes: match.row.photo,
    contentType: match.row.photoContentType || "image/webp",
  };
}

async function profileForPhotoChange(rosterKey: string) {
  const account = await getOrCreateUserAccount();
  if (!account) return null;
  const memberships = await prisma.organizationMembership.findMany({
    where: { userAccountId: account.id, active: true, churchAccess: "ACTIVE" },
    include: { roleType: true },
  });
  for (const membership of memberships) {
    const stored = await loadProfiles(membership.organizationId);
    const match = stored.find((item) => item.snapshot.rosterKey === rosterKey);
    if (!match) continue;
    const viewer: ChurchProfileViewer = {
      organizationId: membership.organizationId,
      userAccountId: account.id,
      active: true,
      churchAccess: "ACTIVE",
      isAdmin: membership.roleType.code === RoleCode.ORG_ADMIN,
    };
    const owns = match.snapshot.linkedUserAccountId === account.id;
    if (viewer.isAdmin || owns) return { accountId: account.id, row: match.row, viewer };
  }
  return null;
}

export async function saveChurchProfilePhoto(rosterKey: string, bytes: Uint8Array) {
  const target = await profileForPhotoChange(rosterKey);
  if (!target) return { ok: false as const, message: "You cannot change this photo." };
  const prepared = await prepareChurchProfilePhoto(bytes);
  await prisma.churchPersonProfile.update({
    where: { id: target.row.id },
    data: { photo: Buffer.from(prepared.image), photoContentType: prepared.contentType },
  });
  const auditError = await recordProfileAudit({
    organizationId: target.row.organizationId,
    actorUserAccountId: target.accountId,
    action: "CHURCH_PROFILE_UPDATE",
    entityType: "ChurchPersonProfile",
    entityId: target.row.id,
    changes: [{ field: "photo", oldValue: target.row.photo ? "replaced" : null, newValue: "saved" }],
  });
  if (auditError) return { ok: false as const, message: auditError };
  return { ok: true as const };
}

export async function removeChurchProfilePhoto(rosterKey: string) {
  const target = await profileForPhotoChange(rosterKey);
  if (!target) return { ok: false as const, message: "You cannot change this photo." };
  await prisma.churchPersonProfile.update({
    where: { id: target.row.id },
    data: { photo: null, photoContentType: null },
  });
  const auditError = await recordProfileAudit({
    organizationId: target.row.organizationId,
    actorUserAccountId: target.accountId,
    action: "CHURCH_PROFILE_UPDATE",
    entityType: "ChurchPersonProfile",
    entityId: target.row.id,
    changes: [{ field: "photo", oldValue: "saved", newValue: null }],
  });
  if (auditError) return { ok: false as const, message: auditError };
  return { ok: true as const };
}

export { memberChurchProfile };
