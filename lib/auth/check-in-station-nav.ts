/**
 * Navigation visibility for Blueprint 7.3L station management.
 * Must match page guard and 7.3K/7.3J `canManageCheckIn` — not operate-only.
 */
export function canShowCheckInStationsNav(access: {
  canManageCheckIn?: boolean;
}) {
  return Boolean(access.canManageCheckIn);
}
