import { z } from "zod";

const emailSchema = z.string().trim().email();
const websiteSchema = z
  .string()
  .trim()
  .url()
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  });

function trimmed(value: string | null | undefined) {
  const text = value?.trim() ?? "";
  return text ? text : null;
}

export function sanitizeMemberHelpEmail(value: string | null | undefined) {
  const text = trimmed(value);
  if (!text) return null;
  const parsed = emailSchema.safeParse(text);
  return parsed.success ? parsed.data : null;
}

export function sanitizeMemberHelpPhone(value: string | null | undefined) {
  const text = trimmed(value);
  if (!text) return null;
  const digits = text.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return text;
}

export function memberHelpTelHref(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return `tel:+${digits.length === 10 ? `1${digits}` : digits}`;
}

export function sanitizeMemberHelpWebsite(value: string | null | undefined) {
  const text = trimmed(value);
  if (!text) return null;
  const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  const parsed = websiteSchema.safeParse(withProtocol);
  return parsed.success ? parsed.data : null;
}

export function sanitizeMemberHelpAddress(input: {
  mailingAddressLine1?: string | null;
  mailingAddressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}) {
  const mailingAddressLine1 = trimmed(input.mailingAddressLine1);
  const mailingAddressLine2 = trimmed(input.mailingAddressLine2);
  const city = trimmed(input.city);
  const state = trimmed(input.state);
  const postalCode = trimmed(input.postalCode);
  const country = trimmed(input.country);
  if (
    !mailingAddressLine1 &&
    !mailingAddressLine2 &&
    !city &&
    !state &&
    !postalCode
  ) {
    return null;
  }
  return {
    mailingAddressLine1,
    mailingAddressLine2,
    city,
    state,
    postalCode,
    country,
  };
}

export function formatMemberHelpAddress(
  address: NonNullable<ReturnType<typeof sanitizeMemberHelpAddress>>,
) {
  const cityLine = [address.city, address.state].filter(Boolean).join(", ");
  return [
    address.mailingAddressLine1,
    address.mailingAddressLine2,
    [cityLine, address.postalCode].filter(Boolean).join(" "),
    address.country && address.country !== "US" ? address.country : null,
  ]
    .filter(Boolean)
    .join("\n");
}
