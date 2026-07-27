export type StaffCheckInAvailabilityState =
  | "disabled"
  | "not_open"
  | "open"
  | "closed";

/**
 * Helpful UI state from server-provided settings.
 * The 7.3D endpoint remains the authoritative availability decision.
 * Window convention matches 7.3C: open inclusive, close exclusive.
 */
export function getStaffCheckInAvailabilityState(
  settings: {
    checkInEnabled: boolean;
    checkInOpensAt: Date | string | null;
    checkInClosesAt: Date | string | null;
  },
  now: Date = new Date(),
): StaffCheckInAvailabilityState {
  if (!settings.checkInEnabled) return "disabled";

  const opensAt = settings.checkInOpensAt
    ? new Date(settings.checkInOpensAt)
    : null;
  const closesAt = settings.checkInClosesAt
    ? new Date(settings.checkInClosesAt)
    : null;

  if (opensAt && !Number.isNaN(opensAt.getTime()) && now < opensAt) {
    return "not_open";
  }
  if (closesAt && !Number.isNaN(closesAt.getTime()) && now > closesAt) {
    return "closed";
  }
  return "open";
}

export function staffCheckInAvailabilityLabel(
  state: StaffCheckInAvailabilityState,
) {
  switch (state) {
    case "disabled":
      return "Check-in is disabled for this event.";
    case "not_open":
      return "Check-in is not open yet.";
    case "closed":
      return "Check-in has closed.";
    case "open":
      return "Check-in is open.";
  }
}
