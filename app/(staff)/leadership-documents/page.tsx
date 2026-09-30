import { redirect } from "next/navigation";

import {
  LEADERSHIP_DOCUMENT_ARCHIVE_FILTERS,
  LEADERSHIP_DOCUMENT_DESCRIPTION_MAX,
  LEADERSHIP_DOCUMENT_TITLE_MAX,
  LEADERSHIP_DOCUMENT_TITLE_MIN,
  LEADERSHIP_DOCUMENT_TYPE_LABELS,
  LEADERSHIP_DOCUMENT_TYPES,
  LEADERSHIP_DOCUMENTS_EMPTY_COPY,
  LEADERSHIP_DOCUMENTS_NOTICE,
  type LeadershipDocumentRow,
} from "@/lib/validation/leadership-document";
import { getLeadershipDocuments } from "@/server/services/leadership-document.service";

import {
  archiveLeadershipDocumentAction,
  createLeadershipDocumentAction,
  restoreLeadershipDocumentAction,
} from "./actions";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";
const fieldClass =
  "mt-1 w-full rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 text-sm text-[var(--bits-navy)]";

export default async function LeadershipDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    documentType?: string;
    archived?: string;
    success?: string;
    error?: string;
  }>;
}) {
  const query = await searchParams;
  const review = await getLeadershipDocuments(query);

  if (review.status === "SIGNED_OUT") redirect("/sign-in");
  if (review.status === "NO_ORGANIZATION") redirect("/settings/organization");
  if (review.status === "UNAUTHORIZED") redirect("/dashboard");

  const rows = review.status === "READY" ? review.rows : [];
  const showingArchived = query.archived === "archived";

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Administration
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
          Leadership Document Library
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          {LEADERSHIP_DOCUMENTS_NOTICE}
        </p>
      </header>

      {review.status === "INVALID_FILTER" ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          Choose a valid document type or archive filter.
        </p>
      ) : null}

      {query.success || query.error ? (
        <p
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm ${
            query.error
              ? "border-rose-300 bg-rose-50 text-rose-800"
              : "border-emerald-300 bg-emerald-50 text-emerald-800"
          }`}
        >
          {query.error ?? query.success}
        </p>
      ) : null}

      <section className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
          Upload a document
        </h2>
        <p className="mt-1 text-sm text-[var(--bits-muted)]">
          PDF, JPG, PNG, DOC, or DOCX files up to 10MB. Files stay in private
          leadership storage.
        </p>
        <form
          action={createLeadershipDocumentAction}
          encType="multipart/form-data"
          className="mt-4 grid gap-4 sm:grid-cols-2"
        >
          <label className="text-sm font-medium text-[var(--bits-navy)]">
            Type
            <select name="documentType" required className={fieldClass}>
              {LEADERSHIP_DOCUMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {LEADERSHIP_DOCUMENT_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-[var(--bits-navy)]">
            Title
            <input
              name="title"
              required
              minLength={LEADERSHIP_DOCUMENT_TITLE_MIN}
              maxLength={LEADERSHIP_DOCUMENT_TITLE_MAX}
              className={fieldClass}
            />
          </label>
          <label className="text-sm font-medium text-[var(--bits-navy)] sm:col-span-2">
            Description
            <textarea
              name="description"
              maxLength={LEADERSHIP_DOCUMENT_DESCRIPTION_MAX}
              rows={3}
              className={fieldClass}
            />
          </label>
          <label className="text-sm font-medium text-[var(--bits-navy)] sm:col-span-2">
            File
            <input
              name="file"
              type="file"
              required
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,application/pdf,image/jpeg,image/png,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className={fieldClass}
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              className={`rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
            >
              Upload document
            </button>
          </div>
        </form>
      </section>

      <form
        method="get"
        className="grid gap-4 rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm sm:grid-cols-3"
      >
        <label className="text-sm font-medium text-[var(--bits-navy)]">
          Type
          <select
            name="documentType"
            defaultValue={query.documentType ?? ""}
            className={fieldClass}
          >
            <option value="">All types</option>
            {LEADERSHIP_DOCUMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {LEADERSHIP_DOCUMENT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-[var(--bits-navy)]">
          Status
          <select
            name="archived"
            defaultValue={query.archived ?? "active"}
            className={fieldClass}
          >
            {LEADERSHIP_DOCUMENT_ARCHIVE_FILTERS.map((filter) => (
              <option key={filter} value={filter}>
                {filter === "archived" ? "Archived" : "Active"}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            className={`rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
          >
            Apply filter
          </button>
        </div>
      </form>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          {showingArchived ? "Archived documents" : "Active documents"}
        </h2>
        {rows.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--bits-muted)]">
            {LEADERSHIP_DOCUMENTS_EMPTY_COPY}
          </p>
        ) : (
          <>
            <ul className="mt-4 grid gap-4 lg:hidden">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="rounded-xl border border-[var(--bits-border)] bg-[var(--bits-page)] p-4"
                >
                  <DocumentSummary row={row} />
                  <DocumentActions row={row} />
                </li>
              ))}
            </ul>
            <div className="mt-4 hidden overflow-x-auto lg:block">
              <table className="min-w-full text-left text-sm">
                <caption className="sr-only">
                  Leadership documents for authorized administrators
                </caption>
                <thead>
                  <tr className="border-b border-[var(--bits-border)] text-[var(--bits-muted)]">
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Title
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Type
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      File
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Size
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Uploaded
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Status
                    </th>
                    <th scope="col" className="py-3 font-medium">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-[var(--bits-border)] align-top last:border-0"
                    >
                      <th
                        scope="row"
                        className="py-3 pr-4 font-semibold text-[var(--bits-navy)]"
                      >
                        {row.title}
                      </th>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.typeLabel}
                      </td>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.fileName}
                      </td>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.fileSizeLabel}
                      </td>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.uploadedOnLabel}
                      </td>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.archiveStateLabel}
                      </td>
                      <td className="py-3">
                        <DocumentActions row={row} compact />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function DocumentSummary({ row }: { row: LeadershipDocumentRow }) {
  return (
    <>
      <h3 className="text-lg font-semibold text-[var(--bits-navy)]">
        {row.title}
      </h3>
      <p className="mt-1 text-sm text-[var(--bits-muted)]">
        {row.typeLabel} · {row.fileName} · {row.fileSizeLabel}
      </p>
      <p className="mt-2 text-sm text-[var(--bits-navy)]">
        {row.archiveStateLabel} · Uploaded {row.uploadedOnLabel}
      </p>
      {row.description ? (
        <p className="mt-2 text-sm leading-6 text-[var(--bits-navy)]">
          {row.description}
        </p>
      ) : null}
    </>
  );
}

function DocumentActions({
  row,
  compact = false,
}: {
  row: LeadershipDocumentRow;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "flex flex-wrap gap-2" : "mt-4 flex flex-wrap gap-2"}>
      <a
        href={row.downloadHref}
        className={`rounded-xl bg-[var(--bits-navy)] px-3 py-2 text-sm font-semibold text-white ${focusClass}`}
      >
        Download
        <span className="sr-only"> {row.title}</span>
      </a>
      {row.archived ? (
        <form action={restoreLeadershipDocumentAction}>
          <input type="hidden" name="documentId" value={row.id} />
          <button
            type="submit"
            className={`rounded-xl border border-[var(--bits-border)] px-3 py-2 text-sm font-semibold text-[var(--bits-navy)] ${focusClass}`}
          >
            Restore
            <span className="sr-only"> {row.title}</span>
          </button>
        </form>
      ) : (
        <form action={archiveLeadershipDocumentAction}>
          <input type="hidden" name="documentId" value={row.id} />
          <button
            type="submit"
            className={`rounded-xl border border-[var(--bits-border)] px-3 py-2 text-sm font-semibold text-[var(--bits-navy)] ${focusClass}`}
          >
            Archive
            <span className="sr-only"> {row.title}</span>
          </button>
        </form>
      )}
    </div>
  );
}
