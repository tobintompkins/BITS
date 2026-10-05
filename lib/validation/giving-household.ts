import { z } from "zod";

export const GIVING_HOUSEHOLDS_HREF = "/giving-households";
export const GIVING_HOUSEHOLD_PAGE_SIZE = 25;
export const GIVING_HOUSEHOLD_PICKER_PAGE_SIZE = 25;
export const GIVING_HOUSEHOLD_SEARCH_MAX = 100;
export const GIVING_HOUSEHOLD_NAME_MAX = 120;
export const GIVING_HOUSEHOLD_ADDRESS_MAX = 200;

export const GIVING_HOUSEHOLD_DELIVERY_METHODS = [
  "EMAIL",
  "MAIL",
  "POSTAL_MAIL",
  "PICKUP",
] as const;

export const GIVING_HOUSEHOLD_DELIVERY_LABELS: Record<string, string> = {
  EMAIL: "Email",
  MAIL: "Mail",
  POSTAL: "Postal mail",
  POSTAL_MAIL: "Postal mail",
  PICKUP: "Pickup",
  PICK_UP: "Pickup",
  PICK_UP_AT_CHURCH: "Pick up at church",
};

export const GIVING_HOUSEHOLD_DIRECTORY_COPY =
  "Giving households group donors for statement mailing. These are not church-membership households.";

export const GIVING_HOUSEHOLD_HISTORY_COPY =
  "Membership history is kept. A move closes the current giving-household membership on the day before the effective date and starts a new row. Previously archived statement PDFs are not rewritten.";

export const GIVING_HOUSEHOLD_END_DATE_COPY =
  "The end date is the last day this donor is included in this giving household.";

export const GIVING_HOUSEHOLD_BACKDATE_COPY =
  "A backdated change can change future statement previews. Archived PDFs stay as they were generated. Request a dedicated correction workflow if the current membership started on or after the date you need.";

export const GIVING_HOUSEHOLD_CORRECTION_COPY =
  "A move cannot start on or before the current membership start date. Ask an administrator for a later dedicated correction workflow. Zero-day rows are not deleted as a shortcut.";

export function parseDateOnly(value: string): Date | null {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const [year, month, day] = trimmed.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addUtcDays(date: Date, days: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days),
  );
}

export function compareUtcDates(left: Date, right: Date): number {
  return formatDateOnly(left).localeCompare(formatDateOnly(right));
}

export function calendarDateInTimeZone(now: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  }
}

export function membershipIntervalsOverlap(
  left: { startDate: Date; endDate: Date | null },
  right: { startDate: Date; endDate: Date | null },
) {
  const leftEnd = left.endDate ?? new Date(Date.UTC(9999, 11, 31));
  const rightEnd = right.endDate ?? new Date(Date.UTC(9999, 11, 31));
  return (
    compareUtcDates(left.startDate, rightEnd) <= 0 &&
    compareUtcDates(right.startDate, leftEnd) <= 0
  );
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null);

export const givingHouseholdSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Display name is required.")
    .max(GIVING_HOUSEHOLD_NAME_MAX),
  mailingAddressLine1: z
    .string()
    .trim()
    .min(1, "Mailing address is required.")
    .max(GIVING_HOUSEHOLD_ADDRESS_MAX),
  mailingAddressLine2: optionalText(GIVING_HOUSEHOLD_ADDRESS_MAX),
  city: z.string().trim().min(1, "City is required.").max(80),
  state: z.string().trim().min(1, "State is required.").max(40),
  postalCode: z.string().trim().min(1, "Postal code is required.").max(20),
  country: z.string().trim().min(1, "Country is required.").max(80),
  statementDeliveryMethod: z
    .string()
    .trim()
    .transform((value) => value || null)
    .refine(
      (value) =>
        value == null ||
        (GIVING_HOUSEHOLD_DELIVERY_METHODS as readonly string[]).includes(value),
      "Choose a supported statement delivery method.",
    ),
  active: z.boolean(),
  primaryDonorId: z
    .string()
    .trim()
    .transform((value) => value || null)
    .refine((value) => value == null || z.string().uuid().safeParse(value).success, {
      message: "Choose a valid primary donor.",
    }),
  preferredStatementRecipientId: z
    .string()
    .trim()
    .transform((value) => value || null)
    .refine(
      (value) => value == null || z.string().uuid().safeParse(value).success,
      { message: "Choose a valid preferred statement recipient." },
    ),
});

export type GivingHouseholdFormValues = {
  displayName: string;
  mailingAddressLine1: string;
  mailingAddressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  statementDeliveryMethod: string;
  active: boolean;
  primaryDonorId: string;
  preferredStatementRecipientId: string;
};

export const emptyGivingHousehold: GivingHouseholdFormValues = {
  displayName: "",
  mailingAddressLine1: "",
  mailingAddressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "US",
  statementDeliveryMethod: "",
  active: true,
  primaryDonorId: "",
  preferredStatementRecipientId: "",
};

export type GivingHouseholdActionState = {
  message: string;
  savedId?: string;
  values?: GivingHouseholdFormValues;
};

export type GivingHouseholdPickerState = {
  message: string;
  q: string;
  page: number;
  total: number;
  selectedId: string;
  rows: Array<{
    id: string;
    label: string;
  }>;
};

export type GivingHouseholdMembershipMutation = {
  membershipId: string;
  donorId: string;
  householdIds: string[];
};

export function parseUuid(value: string | undefined | null): string | null {
  const trimmed = String(value ?? "").trim();
  if (!z.string().uuid().safeParse(trimmed).success) return null;
  return trimmed;
}

export function givingHouseholdRefreshPaths(
  result: GivingHouseholdMembershipMutation,
) {
  return {
    directory: GIVING_HOUSEHOLDS_HREF,
    households: result.householdIds.map((id) => `${GIVING_HOUSEHOLDS_HREF}/${id}`),
    donor: `/donors/${result.donorId}`,
  };
}

export function boundedPickerPage(requestedPage: number) {
  return Number.isSafeInteger(requestedPage)
    ? Math.max(1, Math.min(100000, requestedPage))
    : 1;
}

export function givingHouseholdUpdatedAtToken(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

export function formatGivingHouseholdDelivery(value: string | null | undefined) {
  const key = (value ?? "").trim().toUpperCase().replaceAll(" ", "_");
  if (!key) return "Not set";
  return GIVING_HOUSEHOLD_DELIVERY_LABELS[key] ?? value;
}
