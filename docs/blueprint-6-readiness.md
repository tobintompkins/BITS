# Blueprint 6 Readiness Report

**Status: STABILIZED (Blueprint 6.7)**  
**Date:** 2026-07-10  
**Scope:** Member management, care/engagement, lifecycle, duplicates, documents, performance, and operational hardening.

This document summarizes what Blueprint 6 delivers, how it is secured, known limitations, and what remains for Blueprint 7. No secrets are included.

---

## 1. Features delivered

| Area | Capability |
|------|------------|
| Members | CRUD, directory search/filter, pagination (default 25), household links, photos, emergency contacts |
| Households | Member household units (distinct from giving households) |
| Care | Attendance, follow-ups, pastoral care notes, prayer requests, communications |
| Engagement | Milestones, spiritual gifts, ministries/rosters, skills, interests, documents |
| Lifecycle | Active/inactive/archive/deceased, consent history, communication preferences, do-not-contact |
| Duplicates | Bucketed scoring scan, review queue, merge wizard (human-confirmed only) |
| Import/export | CSV template, preview, import, filtered export |
| Route aliases | `/members/*` and `/households/*` redirect to canonical `/member/*` and `/household/*` |

---

## 2. Primary routes

### Canonical
- `/members` — directory (paginated)
- `/member/new`, `/member/[id]`, `/member/[id]/edit`
- `/household/new`, `/household/[id]`, `/household/[id]/edit`
- `/members/import`, `/members/duplicates`, `/members/merge`, `/members/skills`
- `/attendance`, `/follow-ups`, `/pastoral-care`, `/prayer-requests`
- `/ministries`, `/ministries/[id]`
- `/api/member-documents/[id]/download` — authenticated document download

### Aliases (redirect only)
- `/members/new` → `/member/new`
- `/members/[id]` → `/member/[id]`
- `/members/[id]/edit` → `/member/[id]/edit`
- `/households/new` → `/household/new`
- `/households/[id]` → `/household/[id]`
- `/households/[id]/edit` → `/household/[id]/edit`

Middleware protects staff routes including `/ministries(.*)`.

---

## 3. Key Prisma models (Blueprint 6)

- `Member` (+ lifecycle/consent fields)
- `MemberHouseholdUnit`, `MemberHousehold`, `MemberEmergencyContact`
- `MemberAttendance`, `MemberFollowUp`, `PastoralCareNote`, `PrayerRequest`, `MemberCommunication`
- `MemberMilestone`, `SpiritualGift`, `MemberSpiritualGift`, `Ministry`, `MemberMinistry`
- `MemberSkill`, `MemberInterest`, `MemberDocument`
- `MemberConsentHistory`, `MemberMerge`, `MemberDuplicateCandidate`

Performance indexes added in migration `20260710250000_add_blueprint6_performance_indexes` for email/phone/archived/deceased/createdAt, attendance type, follow-up priority, pastoral category/followUpDate/confidential, communication type/followUpDate, document confidential, consent type, and duplicate pair member ids.

---

## 4. Permissions (high level)

| Domain | Gate |
|--------|------|
| Members | `lib/auth/member-permissions.ts` |
| Care | `lib/auth/care-permissions.ts` (prayer privacy + pastoral sanitize) |
| Engagement | `lib/auth/member-engagement-permissions.ts` |
| Lifecycle / duplicates / merge | `lib/auth/member-lifecycle-permissions.ts` |

Sensitive rules:
- Confidential pastoral notes are redacted for unauthorized viewers; timeline uses opaque ids (`pastoral-restricted-*`) without real UUIDs.
- Private prayer visibility is limited to elevated roles or the creating user.
- Document downloads always go through the API route with permission checks.
- Merge never auto-applies; duplicate scan only creates review candidates.

---

## 5. Storage

**New member documents** are stored under private local paths:

`{BITS_FILE_STORAGE_ROOT|cwd}/storage/private/members/{org}/{member}/documents/`

- `storageKey`: `private/members/...`
- `fileUrl` / `publicUrl`: API placeholder `/api/member-documents` (UI uses `/api/member-documents/[id]/download`)
- Resolve/remove helpers check **private first**, then legacy `public/uploads/...`

**Production:** replace the local adapter with S3/R2/GCS, private buckets, and signed URLs. Keep the same service API and permissioned download route.

Photos/logos may still use public upload paths until a later hardening pass.

---

## 6. Tests

| Suite | Command | Notes |
|-------|---------|-------|
| Unit | `npm run test` / `npm run test:unit` | Vitest — validation, scoring, buckets, care sanitize, documents, DNC |
| E2E | `npm run test:e2e` | Playwright smoke; **skips authenticated flows** without Clerk test env |

E2E env (optional): `E2E_CLERK_USER_EMAIL`, `E2E_CLERK_USER_PASSWORD`, `PLAYWRIGHT_BASE_URL`. Do not fail CI falsely when unset.

---

## 7. Known limitations

1. Duplicate scan is **synchronous** (capped at 2000 members) with a clear truncation message; background-job hook documented in `lib/members/duplicate-scan-runner.ts`.
2. Member select options load all ACTIVE/INACTIVE members (lean columns) — fine for typical church sizes; may need typeahead later.
3. Timeline pagination merges in-memory after fetching per-source caps (50 each), then pages (default 20).
4. Rate limiting is a **no-op placeholder** (`lib/security/rate-limit.ts`) wired on scan/merge/import/export/document upload.
5. Local private storage is not multi-instance safe; production needs object storage.
6. Playwright does not fully automate Clerk sign-in yet.
7. Giving `Household` vs member `MemberHouseholdUnit` remain separate domains.

---

## 8. Environment variables (names only)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | App + Prisma connection |
| `DIRECT_URL` | Optional direct DB URL for migrations behind a pooler |
| `CLERK_*` / `NEXT_PUBLIC_CLERK_*` | Auth |
| `APP_BASE_URL` | App origin |
| `BITS_FILE_STORAGE_ROOT` | Private file root (optional) |
| `BITS_AUTO_PROVISION_ORG_ACCESS` | Dev org access provisioning (optional) |
| `RATE_LIMIT_*` | Future Redis/Upstash (unused until enabled) |
| `E2E_CLERK_*` / `PLAYWRIGHT_*` | Optional e2e |

See `.env.example`. Never commit `.env`.

---

## 9. Migration notes

1. `npx prisma migrate deploy` (or `npm run db:migrate`)
2. Apply includes `20260710250000_add_blueprint6_performance_indexes`
3. `npm run prisma:generate`
4. `npm run db:seed` for demo data (optional in production)

Legacy document rows with `public/uploads/...` keys continue to resolve; new uploads use private keys only.

---

## 10. Security notes

- Clerk middleware on staff routes (including ministries).
- Role-gated server actions and services.
- Pastoral/prayer redaction; confidential document access audited on download.
- Executable / oversized document uploads rejected.
- Action result helper available (`lib/actions/action-result.ts`); rate-limit hooks ready for Redis.
- Do not expose private storage paths or raw bucket credentials to clients.

---

## 11. Performance notes

- Directory uses `findMembersPage` (paginated lean select).
- Pickers use `getMemberSelectOptions` instead of unbounded full `getMembers({})`.
- Duplicate scan buckets by email, phone, and lastName+first initial (plus same last name); existing pairs loaded once into a Set.
- New composite indexes for common filters and care queries.

---

## 12. Deployment checklist

- [ ] Set `DATABASE_URL` (and `DIRECT_URL` if pooled)
- [ ] Set Clerk keys and URLs
- [ ] Run `npm run db:migrate` && `npm run prisma:generate`
- [ ] Configure object storage adapter before multi-instance production
- [ ] Confirm `/api/member-documents/[id]/download` works behind auth
- [ ] Enable rate limits when Redis/Upstash is available
- [ ] Run `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`
- [ ] Treat `npm run test:e2e` as optional until Clerk e2e credentials exist

---

## 13. Blueprint 7 readiness

Blueprint 6 member/care/lifecycle foundations are stable enough to build on. Suggested Blueprint 7 themes:

- Background jobs for duplicate scan / large imports
- Typeahead member pickers and server-driven timeline paging UI
- Production file storage + retention policies
- Real rate limiting and abuse controls
- Deeper e2e coverage with Clerk test users
- Cross-module reporting (attendance × giving × engagement) without unbounded queries

**Confirmation: Blueprint 6 is STABILIZED for the 6.7 patch scope.**
