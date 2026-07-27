/** Minimal access shape for prayer/pastoral privacy checks (no DB imports). */
export type CarePrivacyAccess = {
  isSuperAdmin: boolean;
  canViewPrayerRequests: boolean;
  canViewPastoralStaffPrayer: boolean;
  canViewPrivatePrayer: boolean;
  canViewConfidentialPastoralCare: boolean;
  userAccountId: string | null;
};

export function canViewPrayerPrivacy(
  access: CarePrivacyAccess,
  privacyLevel: string,
  createdByUserId?: string | null,
) {
  if (access.isSuperAdmin || access.canViewPrivatePrayer) {
    return true;
  }

  if (privacyLevel === "PUBLIC" || privacyLevel === "PRAYER_TEAM") {
    return access.canViewPrayerRequests;
  }

  if (privacyLevel === "PASTORAL_STAFF") {
    return access.canViewPastoralStaffPrayer;
  }

  if (privacyLevel === "PRIVATE") {
    return (
      access.canViewPrivatePrayer ||
      (createdByUserId != null && createdByUserId === access.userAccountId)
    );
  }

  return false;
}

export function sanitizePastoralNoteForAccess(
  note: { isConfidential: boolean; note: string; title: string },
  access: Pick<CarePrivacyAccess, "canViewConfidentialPastoralCare">,
) {
  if (note.isConfidential && !access.canViewConfidentialPastoralCare) {
    return {
      ...note,
      note: "[Confidential — restricted]",
      title: note.title,
      restricted: true as const,
    };
  }

  return { ...note, restricted: false as const };
}
