import { redirect } from "next/navigation";

import {
  BACKUP_READINESS_NOTICE,
  BACKUP_READINESS_NOTES_MAX,
  BACKUP_READINESS_EMPTY_COPY,
  BACKUP_READINESS_RESULT_LABELS,
  BACKUP_READINESS_RESULTS,
  BACKUP_READINESS_SCOPE_LABELS,
  BACKUP_READINESS_SCOPES,
  BACKUP_READINESS_STORAGE_SUMMARY_MAX,
  BACKUP_READINESS_SUBTITLE,
  type BackupReadinessLogRow,
  type BackupReadinessScopeStatus,
} from "@/lib/validation/backup-readiness";
import { getBackupReadinessLog } from "@/server/services/backup-readiness.service";

import { createBackupReadinessLogAction } from "./actions";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";
const fieldClass =
  "mt-1 w-full rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 text-sm text-[var(--bits-navy)]";

function StatusCard({ status }: { status: BackupReadinessScopeStatus }) {
  return (
    <li
      className={`rounded-2xl border border-t-4 bg-white p-4 shadow-sm ${
        status.needsReview
          ? "border-[var(--bits-gold)] border-t-[var(--bits-gold)] bg-[var(--bits-page)]"
          : "border-[var(--bits-border)] border-t-[var(--bits-gold)]"
      }`}
    >
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--bits-gold-dark)]">
        {status.scopeLabel}
      </p>
      <p className="mt-2 font-semibold text-[var(--bits-navy)]">
        {status.resultLabel}
      </p>
      <p className="mt-1 text-sm text-[var(--bits-navy)]">
        Checked {status.checkedAtLabel}
      </p>
      <p className="mt-1 text-sm text-[var(--bits-muted)]">
        Next review {status.nextReviewLabel}
      </p>
      {status.needsReview ? (
        <p className="mt-2 text-sm font-medium text-[var(--bits-navy)]">
          Needs review
        </p>
      ) : null}
    </li>
  );
}

function HistoryCard({ row }: { row: BackupReadinessLogRow }) {
  return (
    <li className="rounded-xl border border-[var(--bits-border)] bg-white p-4">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--bits-gold-dark)]">
        {row.scopeLabel}
      </p>
      <p className="mt-1 font-semibold text-[var(--bits-navy)]">
        {row.resultLabel}
      </p>
      <p className="mt-1 text-sm text-[var(--bits-navy)]">
        Checked {row.checkedAtLabel}
      </p>
      <p className="mt-1 text-sm text-[var(--bits-muted)]">
        Next review {row.nextReviewLabel}
      </p>
      {row.storageSummary ? (
        <p className="mt-2 text-sm text-[var(--bits-navy)]">{row.storageSummary}</p>
      ) : null}
      {row.notes ? (
        <p className="mt-1 text-sm leading-6 text-[var(--bits-muted)]">
          {row.notes}
        </p>
      ) : null}
    </li>
  );
}

export default async function BackupReadinessPage({
  searchParams,
}: {
  searchParams: Promise<{
    success?: string;
    error?: string;
    scope?: string;
    result?: string;
  }>;
}) {
  const query = await searchParams;
  const log = await getBackupReadinessLog(query);

  if (log.status === "SIGNED_OUT") redirect("/sign-in");
  if (log.status === "NO_ORGANIZATION") redirect("/settings/organization");
  if (log.status === "UNAUTHORIZED") redirect("/dashboard");

  const currentByScope = log.status === "READY" ? log.currentByScope : [];
  const history = log.status === "READY" ? log.history : [];
  const filter =
    log.status === "READY"
      ? log.filter
      : { scope: null, result: null };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Administration
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
          Backup & Restore Readiness
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          {BACKUP_READINESS_SUBTITLE}
        </p>
      </header>

      <aside
        role="note"
        className="rounded-2xl border border-[var(--bits-gold)] bg-white p-4 shadow-sm"
      >
        <p className="text-sm leading-6 text-[var(--bits-navy)]">
          {BACKUP_READINESS_NOTICE}
        </p>
      </aside>

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

      {log.status === "INVALID_FILTER" ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          Choose a valid backup scope or result filter.
        </p>
      ) : null}

      <section>
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Current status
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {currentByScope.map((status) => (
            <StatusCard key={status.scope} status={status} />
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Record Backup Check
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--bits-muted)]">
          Record a check you have already completed outside BITS. This form does
          not start a backup or restore.
        </p>
        <form
          action={createBackupReadinessLogAction}
          className="mt-4 grid gap-4 md:grid-cols-2"
        >
          <label className="text-sm font-medium text-[var(--bits-navy)]">
            Scope
            <select name="scope" required className={fieldClass}>
              {BACKUP_READINESS_SCOPES.map((scope) => (
                <option key={scope} value={scope}>
                  {BACKUP_READINESS_SCOPE_LABELS[scope]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-[var(--bits-navy)]">
            Result
            <select name="result" required className={fieldClass}>
              {BACKUP_READINESS_RESULTS.map((result) => (
                <option key={result} value={result}>
                  {BACKUP_READINESS_RESULT_LABELS[result]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-[var(--bits-navy)]">
            Checked date and time
            <input
              name="checkedAt"
              type="datetime-local"
              required
              className={fieldClass}
            />
          </label>
          <label className="text-sm font-medium text-[var(--bits-navy)]">
            Next review date
            <input name="nextReviewAt" type="date" className={fieldClass} />
          </label>
          <label className="text-sm font-medium text-[var(--bits-navy)] md:col-span-2">
            Storage summary
            <input
              name="storageSummary"
              maxLength={BACKUP_READINESS_STORAGE_SUMMARY_MAX}
              placeholder="Encrypted off-site backup"
              className={fieldClass}
            />
          </label>
          <label className="text-sm font-medium text-[var(--bits-navy)] md:col-span-2">
            Notes
            <textarea
              name="notes"
              maxLength={BACKUP_READINESS_NOTES_MAX}
              rows={3}
              className={fieldClass}
            />
          </label>
          <div className="md:col-span-2">
            <button
              type="submit"
              className={`rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
            >
              Record backup check
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Past checks
        </h2>
        <form
          method="get"
          className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto]"
        >
          <label className="text-sm font-medium text-[var(--bits-navy)]">
            Scope
            <select
              name="scope"
              defaultValue={filter.scope ?? ""}
              className={fieldClass}
            >
              <option value="">All scopes</option>
              {BACKUP_READINESS_SCOPES.map((scope) => (
                <option key={scope} value={scope}>
                  {BACKUP_READINESS_SCOPE_LABELS[scope]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-[var(--bits-navy)]">
            Result
            <select
              name="result"
              defaultValue={filter.result ?? ""}
              className={fieldClass}
            >
              <option value="">All results</option>
              {BACKUP_READINESS_RESULTS.map((result) => (
                <option key={result} value={result}>
                  {BACKUP_READINESS_RESULT_LABELS[result]}
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

        {history.length === 0 ? (
          <p className="mt-4 text-sm leading-6 text-[var(--bits-muted)]">
            {BACKUP_READINESS_EMPTY_COPY}
          </p>
        ) : (
          <>
            <ul className="mt-4 grid gap-3 lg:hidden">
              {history.map((row) => (
                <HistoryCard key={row.id} row={row} />
              ))}
            </ul>
            <div className="mt-4 hidden overflow-x-auto lg:block">
              <table className="min-w-full text-left text-sm">
                <caption className="sr-only">
                  Recorded backup and restore readiness checks
                </caption>
                <thead>
                  <tr className="border-b border-[var(--bits-border)] text-[var(--bits-muted)]">
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Scope
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Result
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Checked
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Next review
                    </th>
                    <th scope="col" className="py-3 font-medium">
                      Storage summary
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-[var(--bits-border)] align-top last:border-0"
                    >
                      <th
                        scope="row"
                        className="py-3 pr-4 font-semibold text-[var(--bits-navy)]"
                      >
                        {row.scopeLabel}
                      </th>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.resultLabel}
                      </td>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.checkedAtLabel}
                      </td>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.nextReviewLabel}
                      </td>
                      <td className="py-3 text-[var(--bits-navy)]">
                        {row.storageSummary ?? "—"}
                        {row.notes ? (
                          <span className="mt-1 block font-normal text-[var(--bits-muted)]">
                            {row.notes}
                          </span>
                        ) : null}
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
