# Leadership Statements and Online Giving

The private Leadership Portal Statements route now provides a read-only
financial overview.

- Organization administrators and treasurers can manage future statement work.
- Report viewers receive read-only access.
- Data-entry and donor roles cannot access the statement screen.
- Navigation visibility follows the same server-derived permissions.
- Official giving totals exclude Stripe sandbox records.
- Stripe test totals and unmatched online gifts are shown separately.
- Recent online gifts show date, donor match, fund, amount, and environment.
- Existing contribution statements show recipient, period, total, and status.
- The screen does not charge, refund, publish, export, or alter Stripe data.

Signed Stripe webhook processing with duplicate-event protection is implemented.
See `docs/stripe-webhook-security.md`. Staff review and donor matching for
unmatched online gifts is implemented at `/statements/unmatched`. See
`docs/unmatched-online-gift-review.md`. The next financial increment is offering
batches, reconciliation, deposit tracking, corrections, and approvals.
