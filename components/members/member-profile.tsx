"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { HouseholdRelationshipValue } from "@/lib/constants/household-relationships";
import type { MembershipStatusValue } from "@/lib/constants/membership-status";
import {
  linkMemberToHouseholdAction,
  removeMemberFromHouseholdAction,
  setHouseholdPrimaryContactAction,
  updateMemberHouseholdRelationshipAction,
} from "@/app/(staff)/household/actions";
import { MembershipStatusBadge } from "@/components/ui/membership-status-badge";
import { Toast } from "@/components/ui/toast";
import { MemberAvatar } from "@/components/members/member-avatar";
import { EmergencyContactsPanel } from "@/components/members/emergency-contacts-panel";
import {
  MemberActivityTimelinePanel,
  MemberAttendancePanel,
  MemberCommunicationsPanel,
  MemberFollowUpPanel,
  MemberPastoralCarePanel,
  MemberPrayerPanel,
} from "@/components/care/member-care-panels";
import {
  MemberDocumentsPanel,
  MemberMilestonesPanel,
  MemberMinistriesPanel,
  MemberSkillsInterestsPanel,
  MemberSpiritualGiftsPanel,
} from "@/components/members/member-engagement-panels";
import type { CareAccess } from "@/lib/auth/care-permissions";
import type { MemberEngagementAccess } from "@/lib/auth/member-engagement-permissions";
import type { MemberLifecycleAccess } from "@/lib/auth/member-lifecycle-permissions";
import type { TimelineFilter } from "@/lib/types/care-engagement";
import { householdRelationshipOptions, formatHouseholdRelationship } from "@/lib/constants/household-relationships";
import { formatMembershipStatus } from "@/lib/constants/membership-status";
import { getMemberDisplayName } from "@/lib/utils/member-display";
import { CommunicationPreferencesPanel } from "@/components/members/communication-preferences-panel";
import { MemberLifecyclePanel } from "@/components/members/member-lifecycle-panel";
import {
  DoNotContactBadge,
  MemberLifecycleBanner,
  MemberRecordStatusBadge,
} from "@/components/members/member-lifecycle-badges";

type HouseholdOption = { id: string; householdName: string };

type MemberLink = {
  relationshipToHousehold: HouseholdRelationshipValue | null;
  isPrimaryContact: boolean;
  household: {
    id: string;
    householdName: string;
    primaryContactId: string | null;
    primaryContact: {
      id: string;
      firstName: string;
      lastName: string;
      preferredName: string | null;
    } | null;
    memberLinks: Array<{
      relationshipToHousehold: HouseholdRelationshipValue | null;
      isPrimaryContact: boolean;
      member: {
        id: string;
        firstName: string;
        lastName: string;
        preferredName: string | null;
        email: string | null;
        phone: string | null;
        membershipStatus: MembershipStatusValue;
      };
    }>;
  };
};

type EmergencyContact = {
  id: string;
  name: string;
  relationship: string;
  phone: string;
  email: string | null;
  isPrimary: boolean;
  notes: string | null;
};

type MemberProfileProps = {
  member: {
    id: string;
    firstName: string;
    middleName: string | null;
    lastName: string;
    preferredName: string | null;
    suffix: string | null;
    email: string | null;
    phone: string | null;
    alternatePhone: string | null;
    dateOfBirth: Date | null;
    gender: string | null;
    maritalStatus: string | null;
    membershipStatus: MembershipStatusValue;
    memberSince: Date | null;
    baptismDate: Date | null;
    salvationDate: Date | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
    notes: string | null;
    recordStatus?: string;
    preferredContactMethod?: string | null;
    mergedIntoMemberId?: string | null;
    archiveReason?: string | null;
    deceasedDate?: Date | null;
    householdLinks: MemberLink[];
    mergedIntoMember?: {
      id: string;
      firstName: string;
      lastName: string;
      preferredName: string | null;
    } | null;
  };
  photoUrl?: string | null;
  emergencyContacts: EmergencyContact[];
  access: { canEdit: boolean; canDelete: boolean; isSuperAdmin?: boolean };
  careAccess: CareAccess;
  lifecycleAccess: MemberLifecycleAccess;
  lifecycleSummary: {
    recordStatus: string;
    archivedAt: Date | null;
    archiveReason: string | null;
    deceasedDate: Date | null;
    deceasedNotes: string | null;
    preferredContactMethod: string | null;
  };
  communicationPreferences: {
    preferredContactMethod: string | null;
    allowEmail: boolean;
    allowSms: boolean;
    allowPhoneCalls: boolean;
    allowPostalMail: boolean;
    allowDirectoryListing: boolean;
    allowPhotoUse: boolean;
  };
  consentHistory: Array<{
    id: string;
    consentType: string;
    previousValue: string | null;
    newValue: string;
    source: string;
    notes: string | null;
    changedAt: Date;
    changedBy: {
      displayName: string | null;
      primaryEmail: string;
    } | null;
  }>;
  households: HouseholdOption[];
  careData: {
    members: Array<{ id: string; firstName: string; lastName: string; preferredName: string | null }>;
    staffUsers: Array<{ id: string; displayName: string | null; primaryEmail: string }>;
    attendanceRecords: Array<{
      id: string;
      attendanceDate: Date;
      serviceName: string;
      attendanceType: string;
      notes: string | null;
    }>;
    attendanceSummary: {
      total: number;
      last30: number;
      last90: number;
      mostRecentDate: Date | null;
      mostFrequentService: string | null;
      attendancePercentage: number | null;
    };
    followUps: Array<{
      id: string;
      followUpType: string;
      status: string;
      priority: string;
      subject: string;
      dueDate: Date | null;
    }>;
    pastoralNotes: Array<{
      id: string;
      category: string;
      title: string;
      note: string;
      isConfidential: boolean;
      restricted?: boolean;
      followUpDate: Date | null;
      resolvedAt: Date | null;
    }>;
    prayerRequests: Array<{
      id: string;
      request: string;
      status: string;
      privacyLevel: string;
      requesterName: string | null;
    }>;
    communications: Array<{
      id: string;
      communicationType: string;
      direction: string;
      subject: string | null;
      messageSummary: string;
      communicationDate: Date;
      followUpRequired: boolean;
    }>;
    timeline: Array<{
      id: string;
      category: TimelineFilter;
      title: string;
      description: string;
      actor: string;
      occurredAt: Date;
      href?: string;
    }>;
  };
  engagementAccess: MemberEngagementAccess;
  engagementData: {
    milestones: Array<{
      id: string;
      milestoneType: string;
      title: string;
      milestoneDate: Date;
      location: string | null;
      officiant: string | null;
      notes: string | null;
      documentKey: string | null;
    }>;
    gifts: Array<{
      id: string;
      proficiencyLevel: string;
      isPrimary: boolean;
      notes: string | null;
      spiritualGift: { id: string; name: string; category: string | null };
    }>;
    ministries: Array<{
      id: string;
      role: string;
      status: string;
      isLeader: boolean;
      joinedDate: Date | null;
      notes: string | null;
      ministry: {
        id: string;
        name: string;
        ministryType: string;
        isActive: boolean;
      };
    }>;
    skills: Array<{
      id: string;
      skillName: string;
      skillCategory: string | null;
      proficiencyLevel: string;
      yearsExperience: number | null;
      isAvailableToServe: boolean;
      notes: string | null;
    }>;
    interests: Array<{
      id: string;
      interestName: string;
      interestCategory: string | null;
      notes: string | null;
    }>;
    documents: Array<{
      id: string;
      documentType: string;
      title: string;
      description: string | null;
      fileName: string;
      isConfidential: boolean;
      expirationDate: Date | null;
      restricted?: boolean;
    }>;
    catalogGifts: Array<{ id: string; name: string; category: string | null }>;
    allMinistries: Array<{ id: string; name: string; ministryType: string }>;
  };
};

const allTabs = [
  "Overview",
  "Contact",
  "Communication Preferences",
  "Church Info",
  "Household",
  "Emergency Contacts",
  "Milestones",
  "Spiritual Gifts",
  "Ministries",
  "Skills & Interests",
  "Documents",
  "Attendance",
  "Follow-Up",
  "Pastoral Care",
  "Prayer Requests",
  "Communications",
  "Notes",
  "Activity",
] as const;

type TabId = (typeof allTabs)[number];

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
        {value?.trim() ? value : "—"}
      </dd>
    </div>
  );
}

function formatDate(value: Date | null) {
  return value ? value.toLocaleDateString() : null;
}

export function MemberProfile({
  member,
  photoUrl,
  emergencyContacts,
  access,
  careAccess,
  lifecycleAccess,
  lifecycleSummary,
  communicationPreferences,
  consentHistory,
  households,
  careData,
  engagementAccess,
  engagementData,
}: MemberProfileProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("Overview");
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const tabs = allTabs.filter((tab) => {
    if (tab === "Communication Preferences") {
      return lifecycleAccess.canViewLifecycle || lifecycleAccess.canManagePreferences;
    }
    if (tab === "Milestones") return engagementAccess.canViewMilestones;
    if (tab === "Spiritual Gifts") return engagementAccess.canViewSpiritualGifts;
    if (tab === "Ministries") return engagementAccess.canViewMinistries;
    if (tab === "Skills & Interests") return engagementAccess.canViewSkillsInterests;
    if (tab === "Documents") return engagementAccess.canViewDocuments;
    return true;
  });

  const householdLink = member.householdLinks[0];
  const household = householdLink?.household;
  const activeMinistries = engagementData.ministries.filter(
    (item) => item.status === "ACTIVE" || item.status === "PAUSED",
  );
  const primaryGift =
    engagementData.gifts.find((gift) => gift.isPrimary) ??
    engagementData.gifts[0] ??
    null;

  const [linkHouseholdId, setLinkHouseholdId] = useState(
    households[0]?.id ?? "",
  );
  const [linkRelationship, setLinkRelationship] = useState<HouseholdRelationshipValue>(
    householdRelationshipOptions[0].value,
  );
  const [relationship, setRelationship] = useState<HouseholdRelationshipValue>(
    householdLink?.relationshipToHousehold ?? householdRelationshipOptions[0].value,
  );

  function runAction(action: () => Promise<void>, successMessage: string) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        setToast(successMessage);
        router.refresh();
      } catch (actionError) {
        setError(
          actionError instanceof Error
            ? actionError.message
            : "Something went wrong.",
        );
      }
    });
  }

  const fullAddress = [
    member.addressLine1,
    member.addressLine2,
    [member.city, member.state, member.postalCode].filter(Boolean).join(", "),
    member.country,
  ]
    .filter((part) => part?.trim())
    .join("\n");

  const recordStatus = member.recordStatus ?? lifecycleSummary.recordStatus;
  const mergedIntoName = member.mergedIntoMember
    ? getMemberDisplayName(member.mergedIntoMember)
    : null;

  return (
    <div className="space-y-6">
      {toast ? (
        <Toast message={toast} onDismiss={() => setToast(null)} />
      ) : null}

      <MemberLifecycleBanner
        recordStatus={recordStatus}
        archiveReason={member.archiveReason ?? lifecycleSummary.archiveReason}
        deceasedDate={member.deceasedDate ?? lifecycleSummary.deceasedDate}
        mergedIntoMemberId={member.mergedIntoMemberId}
        mergedIntoName={mergedIntoName}
      />

      <header className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <MemberAvatar member={member} photoUrl={photoUrl} size="lg" />
            <div className="space-y-2">
              <Link
                href="/members"
                className="text-sm font-medium text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-300"
              >
                ← Back to Members
              </Link>
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
                {getMemberDisplayName(member)}
              </h1>
              {member.preferredName ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-300">
                  Preferred: {member.preferredName}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <MembershipStatusBadge status={member.membershipStatus} />
                <MemberRecordStatusBadge status={recordStatus} />
                {member.preferredContactMethod === "DO_NOT_CONTACT" ||
                lifecycleSummary.preferredContactMethod === "DO_NOT_CONTACT" ? (
                  <DoNotContactBadge />
                ) : null}
                {household ? (
                  <Link
                    href={`/household/${household.id}`}
                    className="text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-300"
                  >
                    {household.householdName}
                  </Link>
                ) : (
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">
                    No household
                  </span>
                )}
              </div>
            </div>
          </div>

          {access.canEdit ? (
            <Link
              href={`/member/${member.id}/edit`}
              className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Edit Member
            </Link>
          ) : null}
        </div>
      </header>

      <div className="overflow-x-auto">
        <div
          role="tablist"
          aria-label="Member profile sections"
          className="flex min-w-max gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-800 dark:bg-zinc-900"
        >
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                activeTab === tab
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {activeTab === "Overview" ? (
        <div className="space-y-6">
          <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <DetailItem label="Full Name" value={getMemberDisplayName(member)} />
              <DetailItem label="Date of Birth" value={formatDate(member.dateOfBirth)} />
              <DetailItem label="Gender" value={member.gender} />
              <DetailItem label="Marital Status" value={member.maritalStatus} />
              <DetailItem
                label="Membership Status"
                value={formatMembershipStatus(member.membershipStatus)}
              />
              <DetailItem label="Member Since" value={formatDate(member.memberSince)} />
            </dl>
            {engagementAccess.canViewSpiritualGifts ? (
              <div className="mt-6 border-t border-zinc-200 pt-6 dark:border-zinc-800">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Spiritual Gifts
                </h3>
                {engagementData.gifts.length === 0 ? (
                  <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                    No spiritual gifts assigned.
                  </p>
                ) : (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {engagementData.gifts.map((gift) => (
                      <li
                        key={gift.id}
                        className="rounded-md border border-zinc-200 px-3 py-1 text-sm text-zinc-800 dark:border-zinc-700 dark:text-zinc-200"
                      >
                        {gift.spiritualGift.name}
                        {gift.isPrimary ? " (Primary)" : ""}
                      </li>
                    ))}
                  </ul>
                )}
                {primaryGift ? (
                  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                    Primary: {primaryGift.spiritualGift.name}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="mt-6 border-t border-zinc-200 pt-6 dark:border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Notes Summary
              </h3>
              <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                {member.notes?.trim()
                  ? member.notes.length > 200
                    ? `${member.notes.slice(0, 200)}…`
                    : member.notes
                  : "No notes on file."}
              </p>
            </div>
          </section>
          {lifecycleAccess.canViewLifecycle ? (
            <MemberLifecyclePanel
              memberId={member.id}
              summary={lifecycleSummary}
              access={lifecycleAccess}
            />
          ) : null}
        </div>
      ) : null}

      {activeTab === "Communication Preferences" ? (
        <CommunicationPreferencesPanel
          memberId={member.id}
          preferences={communicationPreferences}
          consentHistory={consentHistory}
          access={lifecycleAccess}
        />
      ) : null}

      {activeTab === "Contact" ? (
        <section className="space-y-6">
          <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <dl className="grid gap-4 sm:grid-cols-2">
              <DetailItem label="Email" value={member.email} />
              <DetailItem label="Phone" value={member.phone} />
              <DetailItem label="Alternate Phone" value={member.alternatePhone} />
              <DetailItem label="Address" value={member.addressLine1} />
              <DetailItem label="City" value={member.city} />
              <DetailItem label="State" value={member.state} />
              <DetailItem label="ZIP" value={member.postalCode} />
              <DetailItem label="Country" value={member.country} />
            </dl>
          </div>
          <div className="flex flex-wrap gap-3">
            {member.email ? (
              <a
                href={`mailto:${member.email}`}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
              >
                Email member
              </a>
            ) : null}
            {member.phone ? (
              <a
                href={`tel:${member.phone.replace(/\D/g, "")}`}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
              >
                Call member
              </a>
            ) : null}
            {fullAddress ? (
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(fullAddress);
                  setToast("Address copied to clipboard.");
                }}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
              >
                Copy address
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {activeTab === "Church Info" ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <dl className="grid gap-4 sm:grid-cols-2">
            <DetailItem
              label="Membership Status"
              value={formatMembershipStatus(member.membershipStatus)}
            />
            <DetailItem label="Member Since" value={formatDate(member.memberSince)} />
            <DetailItem label="Baptism Date" value={formatDate(member.baptismDate)} />
            <DetailItem label="Salvation Date" value={formatDate(member.salvationDate)} />
            <DetailItem
              label="Ministries"
              value={
                engagementAccess.canViewMinistries
                  ? activeMinistries.length > 0
                    ? activeMinistries
                        .map((item) => item.ministry.name)
                        .join(", ")
                    : "None"
                  : "—"
              }
            />
            <DetailItem label="Attendance" value="Coming soon" />
            <DetailItem label="Giving" value="Coming soon" />
          </dl>
        </section>
      ) : null}

      {activeTab === "Milestones" ? (
        <MemberMilestonesPanel
          memberId={member.id}
          records={engagementData.milestones}
          canManage={engagementAccess.canManageMilestones}
        />
      ) : null}

      {activeTab === "Spiritual Gifts" ? (
        <MemberSpiritualGiftsPanel
          memberId={member.id}
          records={engagementData.gifts}
          catalogGifts={engagementData.catalogGifts}
          canAssign={engagementAccess.canAssignSpiritualGifts}
        />
      ) : null}

      {activeTab === "Ministries" ? (
        <MemberMinistriesPanel
          memberId={member.id}
          records={engagementData.ministries}
          ministries={engagementData.allMinistries}
          canManageRoster={
            engagementAccess.canManageMinistryRosters ||
            engagementAccess.canManageMinistries
          }
        />
      ) : null}

      {activeTab === "Skills & Interests" ? (
        <MemberSkillsInterestsPanel
          memberId={member.id}
          skills={engagementData.skills}
          interests={engagementData.interests}
          canManage={engagementAccess.canManageSkillsInterests}
        />
      ) : null}

      {activeTab === "Documents" ? (
        <MemberDocumentsPanel
          memberId={member.id}
          records={engagementData.documents}
          access={engagementAccess}
        />
      ) : null}

      {activeTab === "Household" ? (
        <section className="space-y-6">
          {household ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Current Household
              </h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <DetailItem label="Household" value={household.householdName} />
                <DetailItem
                  label="Relationship"
                  value={formatHouseholdRelationship(householdLink.relationshipToHousehold)}
                />
                <DetailItem
                  label="Primary Contact"
                  value={
                    householdLink.isPrimaryContact ||
                    household.primaryContactId === member.id
                      ? "Yes"
                      : household.primaryContact
                        ? getMemberDisplayName(household.primaryContact)
                        : "—"
                  }
                />
              </div>

              {access.canEdit ? (
                <div className="mt-6 flex flex-col gap-4 border-t border-zinc-200 pt-6 dark:border-zinc-800">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">
                        Update relationship
                      </span>
                      <select
                        value={relationship}
                        onChange={(event) =>
                          setRelationship(event.target.value as HouseholdRelationshipValue)
                        }
                        className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                      >
                        {householdRelationshipOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() =>
                        runAction(
                          () =>
                            updateMemberHouseholdRelationshipAction({
                              memberId: member.id,
                              householdId: household.id,
                              relationshipToHousehold: relationship,
                            }),
                          "Relationship updated.",
                        )
                      }
                      className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
                    >
                      Update relationship
                    </button>
                    {household.primaryContactId !== member.id ? (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() =>
                          runAction(
                            () =>
                              setHouseholdPrimaryContactAction(
                                household.id,
                                member.id,
                              ),
                            "Primary contact updated.",
                          )
                        }
                        className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
                      >
                        Set as primary contact
                      </button>
                    ) : null}
                    <RemoveFromHouseholdButton
                      memberId={member.id}
                      householdId={household.id}
                      householdName={household.householdName}
                      disabled={isPending}
                      onSuccess={() => {
                        setToast("Member removed from household.");
                        router.refresh();
                      }}
                    />
                  </div>
                </div>
              ) : null}

              <div className="mt-6 overflow-x-auto">
                <h4 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Household Members
                </h4>
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    <tr>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Relationship</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Primary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {household.memberLinks.map((link) => (
                      <tr
                        key={link.member.id}
                        className="border-b border-zinc-100 dark:border-zinc-800"
                      >
                        <td className="px-3 py-3">
                          <Link
                            href={`/member/${link.member.id}`}
                            className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100"
                          >
                            {getMemberDisplayName(link.member)}
                          </Link>
                        </td>
                        <td className="px-3 py-3">
                          {formatHouseholdRelationship(link.relationshipToHousehold)}
                        </td>
                        <td className="px-3 py-3">
                          {formatMembershipStatus(link.member.membershipStatus)}
                        </td>
                        <td className="px-3 py-3">
                          {link.isPrimaryContact ||
                          household.primaryContactId === link.member.id
                            ? "Yes"
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900/50">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                No household linked
              </h3>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                Link this member to an existing household or create a new one.
              </p>
            </div>
          )}

          {access.canEdit ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                {household ? "Link to different household" : "Link to household"}
              </h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    Household
                  </span>
                  <select
                    value={linkHouseholdId}
                    onChange={(event) => setLinkHouseholdId(event.target.value)}
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    {households.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.householdName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    Relationship
                  </span>
                  <select
                    value={linkRelationship}
                    onChange={(event) =>
                      setLinkRelationship(event.target.value as HouseholdRelationshipValue)
                    }
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    {householdRelationshipOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={isPending || !linkHouseholdId}
                  onClick={() =>
                    runAction(
                      () =>
                        linkMemberToHouseholdAction({
                          memberId: member.id,
                          householdId: linkHouseholdId,
                          relationshipToHousehold: linkRelationship,
                        }),
                      "Member linked to household.",
                    )
                  }
                  className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  Link to household
                </button>
                <Link
                  href="/household/new"
                  className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
                >
                  Create new household
                </Link>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {activeTab === "Emergency Contacts" ? (
        <EmergencyContactsPanel
          memberId={member.id}
          contacts={emergencyContacts}
          canEdit={access.canEdit}
        />
      ) : null}

      {activeTab === "Attendance" ? (
        careAccess.canViewAttendance ? (
          <MemberAttendancePanel
            memberId={member.id}
            records={careData.attendanceRecords}
            summary={careData.attendanceSummary}
            members={careData.members}
            canManage={careAccess.canManageAttendance}
            canDelete={careAccess.canDelete || careAccess.canManageAttendance}
          />
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            You do not have permission to view attendance.
          </p>
        )
      ) : null}

      {activeTab === "Follow-Up" ? (
        careAccess.canViewFollowUps ? (
          <MemberFollowUpPanel
            memberId={member.id}
            membershipStatus={member.membershipStatus as never}
            records={careData.followUps}
            members={careData.members}
            staffUsers={careData.staffUsers}
            canManage={careAccess.canManageFollowUps}
            canDelete={careAccess.canDelete}
          />
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            You do not have permission to view follow-ups.
          </p>
        )
      ) : null}

      {activeTab === "Pastoral Care" ? (
        careAccess.canViewPastoralCare ? (
          <MemberPastoralCarePanel
            memberId={member.id}
            records={careData.pastoralNotes}
            members={careData.members}
            staffUsers={careData.staffUsers}
            canManage={careAccess.canManagePastoralCare}
            canDelete={careAccess.canDelete}
            canMarkConfidential={careAccess.canViewConfidentialPastoralCare}
          />
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            You do not have permission to view pastoral care notes.
          </p>
        )
      ) : null}

      {activeTab === "Prayer Requests" ? (
        careAccess.canViewPrayerRequests ? (
          <MemberPrayerPanel
            memberId={member.id}
            records={careData.prayerRequests}
            members={careData.members}
            staffUsers={careData.staffUsers}
            canManage={careAccess.canManagePrayerRequests}
            canDelete={careAccess.canDelete}
          />
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            You do not have permission to view prayer requests.
          </p>
        )
      ) : null}

      {activeTab === "Communications" ? (
        careAccess.canViewCommunications ? (
          <MemberCommunicationsPanel
            memberId={member.id}
            records={careData.communications}
            members={careData.members}
            canManage={careAccess.canManageCommunications}
            canDelete={careAccess.canDelete}
            canCreateFollowUp={careAccess.canManageFollowUps}
          />
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            You do not have permission to view communications.
          </p>
        )
      ) : null}

      {activeTab === "Notes" ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
            {member.notes?.trim() ? member.notes : "No internal notes."}
          </p>
        </section>
      ) : null}

      {activeTab === "Activity" ? (
        <MemberActivityTimelinePanel initialItems={careData.timeline} />
      ) : null}
    </div>
  );
}

function RemoveFromHouseholdButton({
  memberId,
  householdId,
  householdName,
  disabled,
  onSuccess,
}: {
  memberId: string;
  householdId: string;
  householdName: string;
  disabled?: boolean;
  onSuccess: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRemove() {
    startTransition(async () => {
      try {
        setError(null);
        await removeMemberFromHouseholdAction(memberId, householdId);
        setIsOpen(false);
        onSuccess();
      } catch (removeError) {
        setError(
          removeError instanceof Error
            ? removeError.message
            : "Unable to remove member.",
        );
      }
    });
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled || isPending}
        onClick={() => setIsOpen(true)}
        className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
      >
        Remove from household
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
          >
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Remove from household?
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              This will remove this member from {householdName}.
            </p>
            {error ? (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
            ) : null}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={isPending}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRemove}
                disabled={isPending}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white"
              >
                {isPending ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
