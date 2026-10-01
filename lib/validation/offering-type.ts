import { z } from "zod";

export const OFFERING_TYPES_HREF = "/offering-types";
export const OFFERING_TYPE_NAME_MAX = 100;
export const OFFERING_TYPE_DESCRIPTION_MAX = 500;
export const OFFERING_TYPE_CODE_MAX = 64;
export const OFFERING_TYPE_DISPLAY_ORDER_MAX = 99_999;
export const OFFERING_TYPE_PAGE_SIZE = 25;

export const OFFERING_TYPE_DIRECTORY_COPY =
  "Create and maintain giving funds such as General Fund, Building Fund, Missions, and Benevolence.";

export const OFFERING_TYPE_HISTORY_COPY =
  "Deactivating a fund blocks it from new gift entry. Historical gifts, allocations, batch totals, and archived statements stay on file. Tax-deductible defaults apply to future entry only.";

export const OFFERING_TYPE_CODE_LOCK_COPY =
  "An existing integration code cannot be changed here. You may add a code to a fund that does not have one.";

export const OFFERING_TYPE_STRIPE_ALLOWLIST_COPY =
  "Online eligibility applies to this church’s matching Stripe test-checkout funds. A checkbox does not add a new fund to the hosted checkout allowlist.";

export const OFFERING_TYPE_DEACTIVATE_CONFIRM_COPY =
  "I confirm this fund should be deactivated. New gifts and checkout cannot use it. Historical gifts stay on file.";

export const OFFERING_TYPE_REACTIVATE_CONFIRM_COPY =
  "I confirm this fund should be reactivated for new gift entry.";

export function normalizeNewOfferingTypeCode(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  const normalized = trimmed
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .slice(0, OFFERING_TYPE_CODE_MAX);
  return normalized || null;
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null);

export const offeringTypeSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required.")
    .max(OFFERING_TYPE_NAME_MAX, "Name must be 100 characters or fewer."),
  description: optionalText(OFFERING_TYPE_DESCRIPTION_MAX),
  code: z
    .string()
    .trim()
    .max(OFFERING_TYPE_CODE_MAX)
    .transform((value) => normalizeNewOfferingTypeCode(value)),
  defaultTaxDeductible: z.boolean(),
  onlineGivingEnabled: z.boolean(),
  displayOrder: z.coerce
    .number({ error: "Display order must be a whole number." })
    .int("Display order must be a whole number.")
    .min(0, "Display order cannot be negative.")
    .max(
      OFFERING_TYPE_DISPLAY_ORDER_MAX,
      "Display order must be 99999 or less.",
    )
    .finite(),
  active: z.boolean(),
});

export type OfferingTypeFormValues = {
  name: string;
  description: string;
  code: string;
  defaultTaxDeductible: boolean;
  onlineGivingEnabled: boolean;
  displayOrder: string;
  active: boolean;
};

export const emptyOfferingType: OfferingTypeFormValues = {
  name: "",
  description: "",
  code: "",
  defaultTaxDeductible: true,
  onlineGivingEnabled: false,
  displayOrder: "0",
  active: true,
};

export type OfferingTypeActionState = {
  message: string;
  savedId?: string;
  values?: OfferingTypeFormValues;
};

export function offeringTypeUpdatedAtToken(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}
