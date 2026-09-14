/**
 * HouseholdMembership is historical: startDate is inclusive, endDate is the
 * last inclusive day when present, and a null endDate means the membership is
 * still open. A donor may have only one open membership at a time, but earlier
 * rows are kept so gifts can be attributed by offering date.
 */
export function householdMembershipCoversOfferingDate(
  membership: { startDate: Date; endDate: Date | null },
  offeringDate: Date,
) {
  if (offeringDate < membership.startDate) return false;
  if (membership.endDate == null) return true;
  return offeringDate <= membership.endDate;
}

export function householdMembershipOverlapsPeriod(
  membership: { startDate: Date; endDate: Date | null },
  periodStart: Date,
  periodEndExclusive: Date,
) {
  if (membership.startDate >= periodEndExclusive) return false;
  if (membership.endDate == null) return true;
  return membership.endDate >= periodStart;
}
