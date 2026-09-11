# Stripe Webhook Signature Verification

BITS accepts Stripe sandbox webhooks at `/api/stripe/webhook`. This endpoint is
called by Stripe, not by a signed-in member. Clerk authentication is not
required. Live payments are not enabled.

## Raw-body signature verification

The route reads the request body as raw text **before** any JSON parse. It then
reads the `Stripe-Signature` header and `STRIPE_WEBHOOK_SECRET`, and calls the
official Stripe Node SDK:

`stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)`

Verification must succeed before any donation or webhook-event processing.
Missing headers, missing/invalid secrets, and modified payloads return HTTP 400.
BITS does not implement a custom signature algorithm.

## `STRIPE_WEBHOOK_SECRET` setup

Add a non-placeholder value that begins with `whsec_` to the environment. Empty
values, `whsec_...`, and obvious placeholders are rejected.

- **Local testing:** `stripe listen --forward-to localhost:3000/api/stripe/webhook`
  prints a CLI signing secret. Use that value locally.
- **Dashboard endpoint:** a Stripe Dashboard destination has its own different
  `whsec_` secret. Do not mix the two.

`STRIPE_SECRET_KEY` remains test-only (`sk_test_`). Do not put live keys in this
application.

## Supported event type

This increment processes only `checkout.session.completed`.

Other correctly signed event types are stored as `IGNORED` and return HTTP 200.
Refunds, disputes, and failed payments are not processed here.

A completed session is recorded only when all of these are true:

- `payment_status` is `paid`
- `metadata.environment` is `BITS_TEST`
- the event and Checkout Session are test-mode (`livemode` false, `cs_test_…`)
- `amount_total` is a positive integer number of cents within the giving limits
- currency is USD
- `metadata.fund` is one of the allowed giving funds

Live-mode events are ignored and never create a donation.

## Duplicate and concurrency protection

`StripeWebhookEvent.stripeEventId` is globally unique. The first delivery
inserts the event as `PROCESSING`. A second insert of the same ID hits the
database uniqueness constraint and cannot create another row.

- Already `PROCESSED` or `IGNORED` deliveries return HTTP 200 with no new
  donation.
- Concurrent deliveries share the same event row and the same
  `stripeCheckoutSessionId` unique safeguard on `Donation`.
- Either the webhook or the `/give/success` page may arrive first.
  Both call the same idempotent persist helper, so only one test donation is
  stored.

## Retry behavior

Unexpected persistence failures mark the event `FAILED` with a sanitized
internal error code and return a non-2xx status so Stripe can retry.

A later retry of a `FAILED` event is reclaimed (`attemptCount` incremented) and
may succeed. Duplicate successful deliveries return HTTP 200.

## Stored webhook metadata

BITS stores only:

- Stripe event ID and type
- optional Stripe object ID (Checkout Session ID)
- `livemode`
- processing status and attempt count
- optional sanitized error code (`LIVE_MODE_REJECTED`, `UNPAID_SESSION`, …)
- timestamps

## Information that is deliberately not stored

- the complete Stripe payload
- webhook secrets
- card numbers, bank accounts, or payment-method raw details
- full Stripe objects
- sensitive exception text

Test donations keep `isTest: true` and stay excluded from official giving
totals and tax statements. An unmatched email stays unmatched for later staff
review. Donor matching is limited to the current organization.

## How to rotate the webhook secret

1. Create a new Stripe CLI listener or Dashboard endpoint secret.
2. Update `STRIPE_WEBHOOK_SECRET` in the deployment environment.
3. Remove the old endpoint or secret in Stripe.
4. Confirm a test `checkout.session.completed` verifies and records once.

Never commit a real secret. `.env.example` includes an empty
`STRIPE_WEBHOOK_SECRET=`.

## Future production / live-mode review

Before live giving:

- complete Stripe live-mode review and use live secrets only in a dedicated
  production environment
- add refund, dispute, and failed-payment handling
- add staff review for unmatched online gifts
- confirm webhook endpoints, secret rotation, and monitoring
- keep official totals and statements on non-test donations only
