import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { GenerateHouseholdStatementButton } from "@/components/statements/generate-household-statement-button";
import { GenerateReplacementHouseholdStatementButton } from "@/components/statements/generate-replacement-household-statement-button";
import { PrintStatementPreviewButton } from "@/components/statements/print-statement-preview-button";
import { PublishHouseholdStatementButton } from "@/components/statements/publish-household-statement-button";
import { formatMoney } from "@/lib/money/decimal";
import { statementYearBounds } from "@/lib/validation/statement-readiness";
import {
  HouseholdStatementPreviewError,
  getHouseholdStatementPreview,
} from "@/server/services/household-statement-preview.service";
import { TWO_PERSON_PUBLISH_MESSAGE } from "@/server/services/household-statement-publish.service";

function formatUtcDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(value);
}

function present(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function formatAddress(row: {
  mailingAddressLine1: string | null;
  mailingAddressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country?: string | null;
}) {
  const lines = [
    row.mailingAddressLine1,
    row.mailingAddressLine2,
    [row.city, row.state].filter((part) => present(part)).join(", ") +
      (present(row.postalCode) ? ` ${row.postalCode}` : ""),
    row.country,
  ]
    .map((line) => line?.trim())
    .filter(Boolean);
  return lines.length ? lines.join("\n") : "No mailing address on file.";
}

function statementStatusLabel(status: string | null) {
  switch (status) {
    case "GENERATED":
      return "Generated";
    case "PUBLISHED":
      return "Published";
    case "VOIDED":
      return "VOIDED";
    default:
      return "None";
  }
}

function CheckRow({
  title,
  ready,
  readyLabel,
  attentionLabel,
}: {
  title: string;
  ready: boolean;
  readyLabel: string;
  attentionLabel: string;
}) {
  return (
    <article
      className={`print-hidden rounded-2xl border border-[var(--bits-border)] border-t-4 bg-white p-4 shadow-sm ${
        ready ? "border-t-emerald-600" : "border-t-amber-400"
      }`}
    >
      <h3 className="text-sm font-semibold text-[var(--bits-navy)]">{title}</h3>
      <p
        className={`mt-2 text-sm ${ready ? "text-emerald-800" : "text-amber-900"}`}
      >
        {ready ? readyLabel : attentionLabel}
      </p>
    </article>
  );
}

export default async function HouseholdStatementPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ householdId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { householdId } = await params;
  const query = await searchParams;
  let preview;
  try {
    preview = await getHouseholdStatementPreview(householdId, query.year);
  } catch (error) {
    if (
      error instanceof HouseholdStatementPreviewError &&
      error.code === "SIGNED_OUT"
    ) {
      redirect("/sign-in");
    }
    if (
      error instanceof HouseholdStatementPreviewError &&
      error.code === "FORBIDDEN"
    ) {
      redirect("/dashboard");
    }
    if (
      error instanceof HouseholdStatementPreviewError &&
      error.code === "NOT_FOUND"
    ) {
      notFound();
    }
    throw error;
  }

  const blockingStatus =
    preview.statement.status === "GENERATED" ||
    preview.statement.status === "PUBLISHED";
  const canGenerate =
    preview.canManageStatements &&
    !blockingStatus &&
    preview.statement.status !== "VOIDED";
  const canReissue =
    preview.canManageStatements &&
    preview.statement.status === "VOIDED" &&
    Boolean(preview.statement.statementIdentifier);
  const canReviewGeneratedPdf =
    preview.canManageStatements &&
    preview.statement.status === "GENERATED" &&
    Boolean(preview.statement.id);
  const isGenerator =
    preview.statement.generatedByUserAccountId != null &&
    preview.statement.generatedByUserAccountId === preview.viewerUserAccountId;
  const canPublish =
    preview.canManageStatements &&
    preview.statement.status === "GENERATED" &&
    Boolean(preview.statement.id) &&
    !isGenerator;
  const generatedNotice = Array.isArray(query.generated)
    ? query.generated[0]
    : query.generated;
  const publishedNotice = Array.isArray(query.published)
    ? query.published[0]
    : query.published;
  const einWarning = Array.isArray(query.einWarning)
    ? query.einWarning[0]
    : query.einWarning;

  const organizationAddressReady =
    present(preview.organization.mailingAddressLine1) &&
    present(preview.organization.city) &&
    present(preview.organization.state) &&
    present(preview.organization.postalCode);
  const { min, max } = statementYearBounds();
  const years = [];
  for (let year = max; year >= min; year -= 1) {
    years.push(year);
  }

  return (
    <div className="statement-preview space-y-6">
      <header className="print-hidden">
        <Link
          href="/households"
          className="text-sm font-medium text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          ← Back to Households
        </Link>
        <p className="mt-4 text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Giving
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
          Household Statement Preview
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          Proposed {preview.year} household contribution statement details for{" "}
          {preview.household.displayName}. Calendar year {preview.year} covers{" "}
          {formatUtcDate(preview.periodStart)} through December 31,{" "}
          {preview.year}.
        </p>
      </header>

      <PrintStatementPreviewButton />

      {publishedNotice && preview.statement.status === "PUBLISHED" ? (
        <p
          role="status"
          className="print-hidden rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-sm leading-6 text-emerald-950"
        >
          Official household statement {publishedNotice} is published. Only the
          authorized preferred household recipient can now view or download it
          from their secure portal. It is not a public URL and was not emailed.
        </p>
      ) : generatedNotice && preview.statement.exists ? (
        <p
          role="status"
          className="print-hidden rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-sm leading-6 text-emerald-950"
        >
          Official household statement {generatedNotice} was generated but not
          published. It is private and cannot yet be viewed by household
          members.
          {einWarning === "1" || !preview.organization.einPresent
            ? " No EIN is on file; generation was not blocked for that reason."
            : null}
        </p>
      ) : blockingStatus ? (
        <p
          role="status"
          className="print-hidden rounded-2xl border border-[var(--bits-border)] bg-white p-5 text-sm leading-6 text-[var(--bits-navy)]"
        >
          {preview.statement.status === "PUBLISHED"
            ? "This official household statement is published. Only the authorized preferred household recipient can view or download it from their secure portal. It is not a public URL."
            : "An official household statement has already been generated for this household and year. It is not published and cannot yet be viewed by household members. Duplicate generation is not offered."}{" "}
          Identifier: {preview.statement.statementIdentifier}.
        </p>
      ) : preview.statement.status === "VOIDED" ? (
        <p
          role="status"
          className="print-hidden rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm leading-6 text-rose-950"
        >
          Official household statement {preview.statement.statementIdentifier}{" "}
          is VOIDED. The record and PDF are retained for audit and it is not
          available in the member portal. A replacement can be generated from
          current official household records; it stays private until another
          authorized person publishes it.{" "}
          {preview.statement.id ? (
            <Link
              href={`/statements/registry/${preview.statement.id}`}
              className="font-semibold underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            >
              View VOIDED statement {preview.statement.statementIdentifier}
            </Link>
          ) : null}
        </p>
      ) : (
        <p
          role="status"
          className="print-hidden rounded-2xl border border-[var(--bits-gold)] bg-[var(--bits-gold)]/10 p-5 text-sm font-semibold leading-6 text-[var(--bits-navy)]"
        >
          Preview only — no statement has been created or published
        </p>
      )}

      {canGenerate ? (
        <GenerateHouseholdStatementButton
          householdId={householdId}
          year={preview.year}
        />
      ) : null}

      {canReissue && preview.statement.statementIdentifier ? (
        <GenerateReplacementHouseholdStatementButton
          householdId={householdId}
          year={preview.year}
          priorStatementIdentifier={preview.statement.statementIdentifier}
        />
      ) : null}

      {canReviewGeneratedPdf ? (
        <div className="print-hidden rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
          <a
            href={`/api/staff/statements/${preview.statement.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
          >
            Open generated household PDF for review
          </a>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
            This official household PDF is generated but not published. It is
            private and is not visible to household members.
          </p>
        </div>
      ) : null}

      {canPublish &&
      preview.statement.id &&
      preview.statement.statementIdentifier ? (
        <PublishHouseholdStatementButton
          statementId={preview.statement.id}
          statementIdentifier={preview.statement.statementIdentifier}
        />
      ) : null}

      {preview.canManageStatements &&
      preview.statement.status === "GENERATED" &&
      isGenerator ? (
        <p
          role="status"
          className="print-hidden rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950"
        >
          {TWO_PERSON_PUBLISH_MESSAGE} Open the generated household PDF for
          review, then ask another authorized treasurer or administrator to
          approve and publish it.
        </p>
      ) : null}

      <header className="print-only print-letterhead">
        <p role="note">
          PREVIEW ONLY — This document has not been generated or published as an
          official contribution statement.
        </p>
        <h1>{preview.organization.name}</h1>
        <address className="whitespace-pre-line not-italic">
          {formatAddress(preview.organization)}
        </address>
        <p>
          Household contribution statement preview for calendar year{" "}
          {preview.year}
        </p>
        <p>
          {formatUtcDate(preview.periodStart)} through December 31,{" "}
          {preview.year}
        </p>
      </header>

      <form
        action={`/statements/households/${preview.household.id}`}
        className="print-hidden rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm"
      >
        <label className="grid max-w-xs gap-1 text-sm">
          <span className="font-medium text-[var(--bits-navy)]">Tax year</span>
          <select
            name="year"
            defaultValue={String(preview.year)}
            className="rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
          >
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="mt-4 rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          Review year
        </button>
      </form>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="print-keep rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
            Household mailing details
          </h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--bits-muted)]">
                Household
              </dt>
              <dd className="mt-1 font-medium text-[var(--bits-navy)]">
                {preview.household.displayName}
              </dd>
            </div>
            <div
              className={
                preview.household.preferredStatementRecipient
                  ? undefined
                  : "print-hidden"
              }
            >
              <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--bits-muted)]">
                Preferred statement recipient
              </dt>
              <dd className="mt-1">
                {preview.household.preferredStatementRecipient?.displayName ??
                  "Not configured"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--bits-muted)]">
                Mailing address
              </dt>
              <dd className="mt-1 whitespace-pre-line">
                {formatAddress(preview.household)}
              </dd>
            </div>
          </dl>
          {preview.household.mailingAddressComplete ? null : (
            <p
              role="status"
              className="print-hidden mt-4 rounded-xl bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-950"
            >
              Mailing address needs review
            </p>
          )}
        </article>

        <article className="print-keep rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
            Included household donors
          </h2>
          <p className="print-hidden mt-2 text-sm leading-6 text-[var(--bits-muted)]">
            Donors with a household membership that overlapped {preview.year}.
            Gifts are included only when the offering date falls inside that
            membership.
          </p>
          {preview.household.includedDonors.length ? (
            <ul className="mt-4 grid gap-2 text-sm">
              {preview.household.includedDonors.map((donor, index) => (
                <li
                  key={`${donor.displayName}-${index}`}
                  className="rounded-xl border border-[var(--bits-border)] px-3 py-2 font-medium text-[var(--bits-navy)]"
                >
                  {donor.displayName}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-[var(--bits-muted)]">
              No household members overlap this year.
            </p>
          )}
        </article>
      </section>

      <section className="print-hidden rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Church statement wording
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <CheckRow
            title="Church name"
            ready={present(preview.organization.name)}
            readyLabel={preview.organization.name}
            attentionLabel="Add a legal or display name in organization settings."
          />
          <CheckRow
            title="Church mailing address"
            ready={organizationAddressReady}
            readyLabel="Line 1, city, state, and postal code are on file."
            attentionLabel="Complete the church mailing address before generating statements."
          />
          <CheckRow
            title="EIN"
            ready={preview.organization.einPresent}
            readyLabel="An EIN is on file."
            attentionLabel="No EIN is on file yet. Add it if the church will print it on statements."
          />
          <CheckRow
            title="Statement wording"
            ready={present(preview.organization.statementFooterText)}
            readyLabel="Statement footer or acknowledgment text is on file."
            attentionLabel="Add approved statement footer or acknowledgment text before publishing."
          />
        </div>
        <p className="mt-4 whitespace-pre-line text-sm text-[var(--bits-navy)]">
          {formatAddress(preview.organization)}
        </p>
        {present(preview.organization.statementFooterText) ? (
          <p className="mt-4 rounded-xl bg-[var(--bits-navy)]/5 p-3 text-sm leading-6 text-[var(--bits-navy)]">
            {preview.organization.statementFooterText}
          </p>
        ) : null}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 print:grid-cols-1">
        <div className="print-keep rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-[var(--bits-muted)]">
            Deductible total
          </p>
          <p className="mt-2 text-2xl font-semibold text-[var(--bits-navy)]">
            {formatMoney(preview.deductibleTotal)}
          </p>
          <p className="mt-1 text-sm text-[var(--bits-muted)]">
            {preview.giftCount} official {preview.giftCount === 1 ? "gift" : "gifts"}
          </p>
        </div>
        <div className="print-hidden rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-[var(--bits-muted)]">
            Current statement status
          </p>
          <p className="mt-2 text-2xl font-semibold text-[var(--bits-navy)]">
            {statementStatusLabel(preview.statement.status)}
          </p>
          <p className="mt-1 text-sm text-[var(--bits-muted)]">
            {preview.statement.statementIdentifier ??
              "No household statement exists for this household and year."}
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Proposed gift detail
        </h2>
        <p className="print-hidden mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          Each gift’s deductible amount is spread across its funds in proportion
          to the recorded allocations. The last fund line for a gift receives any
          rounding remainder so those lines sum to that gift’s deductible amount.
          The statement total uses gift-level deductible amounts and does not
          double-count fund allocations.
        </p>
        {preview.lines.length ? (
          <>
            <ul className="print-hidden mt-4 grid gap-3 sm:hidden">
              {preview.lines.map((line) => (
                <li
                  key={`${line.offeringDate.toISOString()}-${line.fundName}`}
                  className="rounded-xl border border-[var(--bits-border)] p-4"
                >
                  <p className="text-sm font-medium text-[var(--bits-navy)]">
                    {formatUtcDate(line.offeringDate)}
                  </p>
                  <p className="mt-1 text-sm">{line.fundName}</p>
                  <p className="mt-2 text-lg font-semibold">
                    {formatMoney(line.deductibleAmount)}
                  </p>
                </li>
              ))}
            </ul>
            <div className="print-show mt-4 hidden overflow-x-auto sm:block">
              <table className="min-w-full text-left text-sm">
                <caption className="sr-only">
                  Proposed household deductible gift detail for {preview.year}
                </caption>
                <thead className="border-b border-[var(--bits-border)] text-xs uppercase text-[var(--bits-muted)]">
                  <tr>
                    <th scope="col" className="px-3 py-2">
                      Date
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Fund
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Deductible amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {preview.lines.map((line) => (
                    <tr
                      key={`${line.offeringDate.toISOString()}-${line.fundName}`}
                      className="border-b border-[var(--bits-border)] last:border-0"
                    >
                      <td className="px-3 py-3">
                        {formatUtcDate(line.offeringDate)}
                      </td>
                      <td className="px-3 py-3">{line.fundName}</td>
                      <td className="px-3 py-3 font-semibold">
                        {formatMoney(line.deductibleAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="mt-4 text-sm text-[var(--bits-muted)]">
            No official household gifts are recorded for this household in{" "}
            {preview.year}.
          </p>
        )}
      </section>

      {present(preview.organization.statementFooterText) ? (
        <p className="print-only print-keep whitespace-pre-line text-sm leading-6">
          {preview.organization.statementFooterText}
        </p>
      ) : null}

      <p
        role="note"
        className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950"
      >
        BITS does not provide tax or legal advice. Have the church’s approved
        statement wording and records reviewed before publishing.
      </p>
    </div>
  );
}
