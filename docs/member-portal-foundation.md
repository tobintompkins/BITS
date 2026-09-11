# Member Portal Foundation

The first private Member Portal milestone is available at `/portal`.

- Clerk authentication protects the entire portal route.
- The portal resolves the signed-in BITS user account.
- Personal information is loaded only through an explicit donor-to-user link
  within the current organization.
- An unlinked account receives a safe connection-pending screen and no donor,
  giving, or statement queries are performed.
- A linked member sees year-to-date totals, five recent gifts, published
  statements, and limited contact information.
- Internal notes, other donors, household data, pastoral care, and leadership
  records are never included.
- Authorized staff receive a separate Leadership Portal link; ordinary members
  do not.
- The public homepage now sends signed-in people to the Member Portal first.

Published individual and authorized household statement PDFs can be viewed or
downloaded from `/portal/statements` after ownership checks. See
`docs/member-portal-statement-pdf-access.md` and
`docs/member-portal-household-statement-authorization.md`.

Profile editing, full giving history, and additional self-service household
tools remain future small patches.
