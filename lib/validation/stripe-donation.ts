import { z } from "zod";

export const stripeDonationFundOptions = [
  "Tithes",
  "General Offering",
  "Missions",
  "Building Fund",
  "Sunday School",
  "Special Offering",
] as const;

export const STRIPE_TEST_MIN_AMOUNT_CENTS = 100;
export const STRIPE_TEST_MAX_AMOUNT_CENTS = 5_000_000;

export type StripeDonationFund = (typeof stripeDonationFundOptions)[number];

export function isAllowedStripeDonationFund(
  fund: string,
): fund is StripeDonationFund {
  return (stripeDonationFundOptions as readonly string[]).includes(fund);
}

export const memberStripeDonationFundOptions = [
  "Tithes",
  "General Offering",
  "Missions",
  "Home Building Fund",
] as const;

export type MemberStripeDonationFund =
  (typeof memberStripeDonationFundOptions)[number];

export function isAllowedMemberStripeDonationFund(
  fund: string,
): fund is MemberStripeDonationFund {
  return (memberStripeDonationFundOptions as readonly string[]).includes(fund);
}

export function recordedStripeFundCode(fund: string) {
  return `STRIPE_${fund.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`.slice(0, 64);
}

export function isAllowedRecordedStripeDonationFund(fund: string) {
  return (
    isAllowedStripeDonationFund(fund) || isAllowedMemberStripeDonationFund(fund)
  );
}

export function isAllowedStripeDonationAmountCents(cents: number) {
  return (
    Number.isInteger(cents) &&
    cents >= STRIPE_TEST_MIN_AMOUNT_CENTS &&
    cents <= STRIPE_TEST_MAX_AMOUNT_CENTS
  );
}

function optionalContact(max: number) {
  return z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z.string().max(max).transform((value) => value || null),
  );
}

export const stripeDonationSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  phone: optionalContact(50),
  mailingAddressLine1: optionalContact(200),
  mailingAddressLine2: optionalContact(200),
  city: optionalContact(100),
  state: optionalContact(100),
  postalCode: optionalContact(30),
  country: optionalContact(100),
  fund: z.enum(stripeDonationFundOptions),
  amount: z
    .string()
    .trim()
    .regex(/^\d{1,5}(\.\d{1,2})?$/, "Enter a valid dollar amount.")
    .transform((value) => Math.round(Number(value) * 100))
    .refine((cents) => cents >= 100, "The minimum test gift is $1.")
    .refine((cents) => cents <= 5_000_000, "The maximum test gift is $50,000."),
});
