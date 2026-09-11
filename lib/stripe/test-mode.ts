export function getStripeTestSecret() {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  if (
    !key.startsWith("sk_test_") ||
    key.length <= 20 ||
    key.includes("...") ||
    key.includes("…")
  ) {
    return null;
  }
  return key;
}

export function isStripeTestModeConfigured() {
  return Boolean(getStripeTestSecret());
}

/**
 * Dashboard endpoint secrets and Stripe CLI secrets are different values.
 * Both must start with whsec_ and must not be placeholders.
 */
export function getStripeWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
  if (
    !secret.startsWith("whsec_") ||
    secret.length <= 20 ||
    secret.includes("...") ||
    secret.includes("…") ||
    /placeholder|changeme|your_secret|xxxx/i.test(secret)
  ) {
    return null;
  }
  return secret;
}
