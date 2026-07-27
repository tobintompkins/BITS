import { notFound, redirect } from "next/navigation";

import { MemberProfile } from "@/components/members/member-profile";
import { DeleteMemberButton } from "@/components/members/delete-member-button";
import { getMemberAccess } from "@/lib/auth/member-permissions";
import { getMemberDisplayName } from "@/lib/validation/member";
import {
  getMemberById,
  getMemberHouseholdOptions,
  getMemberSelectOptions,
  requireMemberViewAccess,
} from "@/app/(staff)/member/actions";
import { getMemberEmergencyContacts } from "@/app/(staff)/member/emergency-contact-actions";
import {
  getCareAccess,
  getFollowUps,
  getMemberActivityTimeline,
  getMemberAttendanceSummary,
  getMemberCommunications,
  getAttendanceRecords,
  getPastoralCareNotes,
  getPrayerRequests,
  getStaffUserOptions,
} from "@/app/(staff)/care/actions";
import {
  getMemberCommunicationPreferences,
  getMemberConsentHistory,
  getMemberLifecycleSummary,
} from "@/app/(staff)/member-lifecycle/actions";
import { getMemberLifecycleAccess } from "@/lib/auth/member-lifecycle-permissions";
import { getMemberEngagementProfileData } from "@/app/(staff)/member-engagement/actions";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";
import { resolveMemberPhotoUrl } from "@/server/services/member-photo.service";

type MemberDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function MemberDetailPage({ params }: MemberDetailPageProps) {
  const { id } = await params;
  const organization = await findPrimaryOrganization();

  if (!organization) {
    redirect("/settings/organization");
  }

  await requireMemberViewAccess(organization.id);
  const access = await getMemberAccess(organization.id);
  const careAccess = await getCareAccess(organization.id);

  const [member, households, emergencyContacts, memberOptions, staffUsers] =
    await Promise.all([
      getMemberById(id),
      getMemberHouseholdOptions(),
      getMemberEmergencyContacts(id),
      getMemberSelectOptions(),
      getStaffUserOptions(),
    ]);

  if (!member) {
    notFound();
  }

  const [lifecycleSummaryResult, lifecycleAccess] = await Promise.all([
    getMemberLifecycleSummary(id),
    getMemberLifecycleAccess(organization.id),
  ]);

  if (member.recordStatus === "MERGED") {
    if (!lifecycleAccess.canViewMerged) {
      redirect("/members");
    }
  }

  const photoUrl = resolveMemberPhotoUrl(member);

  const [
    attendanceResult,
    attendanceSummary,
    followUpResult,
    pastoralResult,
    prayerResult,
    communicationResult,
    timeline,
    engagementProfile,
    communicationPreferences,
    consentHistory,
  ] = await Promise.all([
    careAccess.canViewAttendance
      ? getAttendanceRecords({ memberId: id })
      : Promise.resolve({ records: [], total: 0 }),
    careAccess.canViewAttendance
      ? getMemberAttendanceSummary(id)
      : Promise.resolve({
          total: 0,
          last30: 0,
          last90: 0,
          mostRecentDate: null,
          mostFrequentService: null,
          attendancePercentage: null,
        }),
    careAccess.canViewFollowUps
      ? getFollowUps({ memberId: id })
      : Promise.resolve({ records: [], total: 0 }),
    careAccess.canViewPastoralCare
      ? getPastoralCareNotes({ memberId: id })
      : Promise.resolve({ records: [], total: 0 }),
    careAccess.canViewPrayerRequests
      ? getPrayerRequests({ memberId: id })
      : Promise.resolve({ records: [], total: 0 }),
    careAccess.canViewCommunications
      ? getMemberCommunications({ memberId: id })
      : Promise.resolve({ records: [], total: 0 }),
    getMemberActivityTimeline(id, "all", { page: 1, pageSize: 20 }),
    getMemberEngagementProfileData(id),
    getMemberCommunicationPreferences(id).catch(() => null),
    lifecycleAccess.canViewConsentHistory
      ? getMemberConsentHistory(id).catch(() => [])
      : Promise.resolve([]),
  ]);

  const lifecycleSummary = lifecycleSummaryResult?.member ?? {
    recordStatus: member.recordStatus,
    archivedAt: member.archivedAt,
    archiveReason: member.archiveReason,
    deceasedDate: member.deceasedDate,
    deceasedNotes: member.deceasedNotes,
    preferredContactMethod: member.preferredContactMethod,
  };

  const prefs = communicationPreferences ?? {
    preferredContactMethod: member.preferredContactMethod,
    allowEmail: member.allowEmail,
    allowSms: member.allowSms,
    allowPhoneCalls: member.allowPhoneCalls,
    allowPostalMail: member.allowPostalMail,
    allowDirectoryListing: member.allowDirectoryListing,
    allowPhotoUse: member.allowPhotoUse,
  };

  return (
    <div className="space-y-6">
      <MemberProfile
        member={member}
        photoUrl={photoUrl}
        emergencyContacts={emergencyContacts}
        access={access}
        careAccess={careAccess}
        lifecycleAccess={lifecycleAccess}
        lifecycleSummary={lifecycleSummary}
        communicationPreferences={{
          preferredContactMethod: prefs.preferredContactMethod,
          allowEmail: prefs.allowEmail,
          allowSms: prefs.allowSms,
          allowPhoneCalls: prefs.allowPhoneCalls,
          allowPostalMail: prefs.allowPostalMail,
          allowDirectoryListing: prefs.allowDirectoryListing,
          allowPhotoUse: prefs.allowPhotoUse,
        }}
        consentHistory={consentHistory}
        households={households}
        careData={{
          members: memberOptions,
          staffUsers,
          attendanceRecords: attendanceResult.records,
          attendanceSummary,
          followUps: followUpResult.records,
          pastoralNotes: pastoralResult.records,
          prayerRequests: prayerResult.records,
          communications: communicationResult.records,
          timeline: timeline.items,
        }}
        engagementAccess={engagementProfile.access}
        engagementData={engagementProfile.data}
      />
      {access.isSuperAdmin ? (
        <div className="flex flex-col items-end gap-2">
          <p className="max-w-md text-right text-xs text-zinc-500 dark:text-zinc-400">
            Permanent deletion is restricted. Prefer Archive for ordinary
            lifecycle management.
          </p>
          <DeleteMemberButton
            memberId={member.id}
            memberName={getMemberDisplayName(member)}
          />
        </div>
      ) : null}
    </div>
  );
}
