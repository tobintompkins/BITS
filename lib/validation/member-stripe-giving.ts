import { z } from "zod";

import {
  memberStripeDonationFundOptions,
  STRIPE_TEST_MAX_AMOUNT_CENTS,
  STRIPE_TEST_MIN_AMOUNT_CENTS,
} from "@/lib/validation/stripe-donation";

export const MEMBER_STRIPE_GIVING_SECURITY_COPY =
  "You will enter card or bank details securely on Stripe’s checkout page. BITS does not store card numbers, bank account numbers, or routing numbers.";

export const MEMBER_STRIPE_GIVING_NOTICE =
  "This gift will be recorded on your connected church giving record after Stripe confirms payment. It does not change previously recorded gifts.";

export { memberStripeDonationFundOptions };

export const memberStripeGivingSchema = z
  .object({
    fund: z.enum(memberStripeDonationFundOptions),
    amount: z
      .string()
      .trim()
      .regex(/^\d{1,5}(\.\d{1,2})?$/, "Enter a valid dollar amount.")
      .transform((value) => Math.round(Number(value) * 100))
      .refine(
        (cents) => cents >= STRIPE_TEST_MIN_AMOUNT_CENTS,
        "The minimum test gift is $1.",
      )
      .refine(
        (cents) => cents <= STRIPE_TEST_MAX_AMOUNT_CENTS,
        "The maximum test gift is $50,000.",
      ),
  })
  .strict();

export type MemberStripeGivingInput = z.infer<typeof memberStripeGivingSchema>;

function configuredPublicOrigin() {
  const appBase = process.env.APP_BASE_URL?.trim();
  if (!appBase) return null;
  try {
    return new URL(appBase).origin;
  } catch {
    return null;
  }
}

export function checkoutAppOrigin(request: Request) {
  return configuredPublicOrigin() ?? new URL(request.url).origin;
}

export function isAllowedCheckoutRequestOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  // A configured public origin is the only allowed browser origin. The
  // request URL and forwarded host headers are not a second allow-list,
  // because a proxy can build that URL from a caller-supplied host.
  const allowed = configuredPublicOrigin() ?? new URL(request.url).origin;
  return origin === allowed;
}
