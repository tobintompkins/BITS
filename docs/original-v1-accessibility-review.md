# Original v1 staff accessibility review

October 30, 2026. Bounded source review of **original staff giving and
administration** screens, updated in Core 18A for gift-form field errors.
Method: inspect current components and routes; repair only reproducible,
narrow defects in those surfaces. No Redesign. No React Testing Library.
No WCAG conformance claim. Git at this update: HEAD `7787b2f` plus
uncommitted Core 18 handbook/review/tests and Core 18A form-error work.

Protected-screen browser checks remain **blocked** without live Clerk.
Public `/visit` does not substitute for staff acceptance.

Official criteria cited (W3C):

- [WCAG 2.1 Success Criterion 1.3.1 Info and Relationships](https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships.html)
- [2.1.1 Keyboard](https://www.w3.org/WAI/WCAG21/Understanding/keyboard.html)
- [2.4.1 Bypass Blocks](https://www.w3.org/WAI/WCAG21/Understanding/bypass-blocks.html)
- [2.4.3 Focus Order](https://www.w3.org/WAI/WCAG21/Understanding/focus-order.html)
- [2.4.4 Link Purpose (In Context)](https://www.w3.org/WAI/WCAG21/Understanding/link-purpose-in-context.html)
- [2.4.6 Headings and Labels](https://www.w3.org/WAI/WCAG21/Understanding/headings-and-labels.html)
- [2.4.7 Focus Visible](https://www.w3.org/WAI/WCAG21/Understanding/focus-visible.html)
- [3.3.1 Error Identification](https://www.w3.org/WAI/WCAG21/Understanding/error-identification.html)
- [3.3.2 Labels or Instructions](https://www.w3.org/WAI/WCAG21/Understanding/labels-or-instructions.html)
- [4.1.2 Name, Role, Value](https://www.w3.org/WAI/WCAG21/Understanding/name-role-value.html)
- [4.1.3 Status Messages](https://www.w3.org/WAI/WCAG21/Understanding/status-messages.html)

Lint passing is not conformance. Automated unit tests here are
source-inspection contracts, not assistive-technology evidence.

## Scope

Included: staff shell, original giving directories (donors, giving
households, offering types, batches), manual gift form, batch
transitions, reports filters, statements registry / unmatched, staff
access, organization settings, backup-readiness, idle timeout, display
options.

Excluded: member/event/volunteer/care redesign, payment-method policy,
ledger math, role grants, Clerk setup.

## Screen / control matrix

| Screen / control | Finding | Criterion | Evidence | Repair this increment | Remaining live check |
|---|---|---|---|---|---|
| Staff shell skip link | No in-page skip to main | 2.4.1 / 2.4.3 | `app/(staff)/layout.tsx` had no skip target | Added **Skip to main content** → `#staff-main-content` | Tab to skip on a signed-in staff page |
| Staff header heading | Site title used `h1`, competing with page `h1` | 1.3.1 / 2.4.6 | Header `h1` “Bring In The Sheaves” | Changed to `p`; page `h1` remains the screen title | Confirm heading outline with a screen reader |
| Church / role in header | Product name only; church was ambiguous | 1.3.1 | Layout now shows authorized church + role from `findPrimaryOrganization` / membership access. No invented fallback. Stop copy when none | Display-only. Live signed-in check still pending | Confirm church name matches the giving page |
| Mobile nav Escape | Drawer closed without restoring focus | 2.4.3 | `components/layout/app-shell-nav.tsx` | Restore focus to the toggle | Keyboard open/close on a narrow viewport |
| Display options | Escape restored focus; pointer dismiss did not | 2.4.3 | `components/accessibility/display-options.tsx` | Restore trigger focus on Escape and outside pointer | Confirm click-outside vs next control; public `/visit` has the same control |
| Idle timeout actions | `flex-col-reverse` put visual **Stay Signed In** above DOM **Sign Out Now** | 1.3.2 / 2.4.3 | `components/security/staff-idle-timeout.tsx` | DOM order matches visual: Stay, then Sign Out | Idle dialog when a staff session is live |
| Toast errors | Success and error both lacked distinct live regions | 4.1.3 | `components/ui/toast.tsx` | Error `role="alert"`; success `role="status"`; dismiss named | Hear a failed save |
| Manual gift form | Core 18 named search/allocations; per-row fund/amount messages were still unrendered; most fields lacked `aria-invalid`/`aria-describedby`; offering-date label nested the override checkbox; empty donor search was treated as invalid | 1.3.1, 3.3.1, 3.3.2, 4.1.2 | `manual-donation-form.tsx`; Zod `flatten()` drops `allocations.n.field` | Core 18A renders nested row errors, unique `useId`+field-id associations, un-nested date confirmation, empty search as `status` not invalid. Server mapping uses issue paths, not flatten. Helper tests cover multi-row fund/amount, clear, remove, date override. Not a signed-in AT pass | Keyboard/screen-reader failed save on a draft batch |
| Giving-household picker | Search and pager names not unique per field | 2.4.4 / 2.4.6 | `giving-household-search-picker.tsx` | **Search {label}**; `nav aria-label="{label} pages"` | Keyboard page through a picker |
| Batches directory | Repeated **View** / **Edit** | 2.4.4 | `app/(staff)/batches/page.tsx` | Row header `scope="row"`; `View/Edit {batch.name}` | Tab the directory table |
| Batch donations | Repeated **Edit**; load failure not an alert | 2.4.4 / 4.1.3 | `app/(staff)/batches/[id]/page.tsx` | Donor `th scope="row"`; **Edit donation from {name}**; load failure `role="alert"` | Open a draft with several gifts |
| Batch transition dialogs | Native `<dialog>` with titled confirm | 2.4.3 / 3.3.1 | `batch-transition-dialog.tsx` | Already `aria-labelledby` + error `role="alert"` | Focus move into/out of Complete / Reconcile / Lock |
| Report view links | Current view not exposed | 1.3.1 / 4.1.2 | `contribution-report-filters.tsx` | `aria-current="page"` on the selected view | Keyboard the view links |
| Organization settings | File input `hidden` (often skipped); error not alert; `outline-none` | 2.1.1, 2.4.7, 4.1.3 | `organization-settings-form.tsx` | `sr-only` file input; form error `role="alert"`; gold `focus-visible` | Keyboard **Upload Logo** and a failed save |
| Staff membership row | Repeated **Intended role**, **Save membership** | 2.4.6 / 4.1.2 | `staff-membership-edit-form.tsx` | Labels/button include `displayName` | Two memberships on Staff Access |
| Invitation revoke | Repeated **Revoke invitation** | 2.4.4 | `staff-invitation-list.tsx` | Includes email | Two pending invites |
| Backup readiness / corrections | Error banners used `role="status"` | 4.1.3 | backup-readiness and corrections pages | Errors `role="alert"`; success stays `status` | Failed log save / failed correction submit |
| Statement registry | Repeated **Open review** / **View timeline** | 2.4.4 | `statements/registry/page.tsx` | `aria-label` includes statement identifier | Registry with several rows |
| Unmatched gifts | Repeated **Review & match** | 2.4.4 | `unmatched-gift-match-dialog.tsx` | Accessible name includes date and amount | Queue with several gifts |
| Donor / household / type directories | Wrapping `<label>` + table headers | 1.3.1 / 3.3.2 | `/donors`, `/giving-households`, `/offering-types` | No defect found in this pass | Live keyboard search |

Authorization, Decimal totals, create idempotency, `reviewVersion`, and
tenant checks were not changed.

## Repairs applied (source)

Core 18: staff layout skip link and header demotion; mobile nav and
display-options focus return; idle-timeout DOM order; toast live regions;
manual donation labels; picker names; batch table names; report
`aria-current`; organization settings keyboard/focus/alert; unique Staff
Access and registry/unmatched names; backup/corrections alerts.

Core 18A: per-row allocation errors; field-to-error `aria-describedby` on
donor, dates, check number, deductible, goods/services, and date
confirmation; nested-label repair; dotted-path server field errors; empty
donor search is a status, not a donor-field failure. Evidence is helper
and schema tests (`lib/validation/manual-donation-field-errors.test.ts`),
not rendered-browser proof. Vitest stays Node-only without Testing
Library.

## Remaining live checks (blocked without Clerk)

1. Signed-in keyboard pass of `/donors`, `/batches/[id]`, `/reports`,
   `/statements/registry`, `/administration/staff-access`.
2. Screen-reader pass of gift-entry errors, batch conflict copy
   (“This batch changed since you opened it. Refresh and review again.”),
   and idle timeout.
3. Native `<dialog>` focus trap/return on Complete Entry, Reconcile Batch,
   Lock Batch, and unmatched match.
4. Display Options on a staff page (public `/visit` can smoke the control
   only).
5. Confirm the header church name and role match the authorized page
   context on a signed-in staff session.

Do not treat this document as a WCAG 2.1 AA certificate.

## Core 18A Google Fonts build (historical)

`app/layout.tsx` then used `next/font/google` `Geist` / `Geist_Mono`.
Official Next docs download those files at **build** time. The
independent Core 18 review **failed** fetching Geist from
`fonts.googleapis.com`. Core 18A’s later production build **passed** by
reusing the existing Next font cache. That cached success did not remove
the cold-cache Google Fonts dependency. Typography was not changed in
18A. Hashed `.next` `.woff2` files were not vendored.

## Core 18B local Geist (current)

Official SIL OFL 1.1 variable webfonts from Geist release **v1.9.0** are
in `app/fonts/`. `app/layout.tsx` uses `next/font/local` and keeps
`--font-geist-sans` / `--font-geist-mono`. See
`docs/geist-font-provenance.md`.

An isolated `/tmp` copy without inherited `.next` cache built with Google
Fonts blocked at the proxy. Isolated `GET /visit` returned 200 and served
the bundled Geist `.woff2` files. Browser computed `font-family` on that
page was `geistSans` with `--font-geist-sans` set; no
`fonts.googleapis.com` / `fonts.gstatic.com` request appeared in the
document or stylesheets. Public `/visit` is not a signed-in staff
keyboard/AT pass and does not rewrite the historical Core 18 fetch
failure as success.
