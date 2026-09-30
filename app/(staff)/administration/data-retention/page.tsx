import { redirect } from "next/navigation";

import {
  DATA_RETENTION_CATEGORIES,
  DATA_RETENTION_CATEGORY_LABELS,
  DATA_RETENTION_POLICIES_EMPTY_COPY,
  DATA_RETENTION_POLICIES_NOTICE,
  DATA_RETENTION_POLICIES_SUBTITLE,
  DATA_RETENTION_SUMMARY_MAX,
  DATA_RETENTION_TITLE_MAX,
  type DataRetentionCategory,
  type DataRetentionPolicyRow,
} from "@/lib/validation/data-retention-policy";
import { getDataRetentionPolicies } from "@/server/services/data-retention-policy.service";

import {
  createDataRetentionPolicyAction,
  deactivateDataRetentionPolicyAction,
  reactivateDataRetentionPolicyAction,
  updateDataRetentionPolicyAction,
} from "./actions";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";
const fieldClass =
  "mt-1 w-full rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 text-sm text-[var(--bits-navy)]";

function PolicyCard({ row }: { row: DataRetentionPolicyRow }) {
  const highlight = row.reviewDue
    ? "border-[var(--bits-gold)] bg-[var(--bits-page)]"
    : "border-[var(--bits-border)] bg-white";

  return (
    <li className={`rounded-xl border p-4 ${highlight}`}>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--bits-gold-dark)]">
        {row.categoryLabel}
      </p>
      <p className="mt-1 font-semibold text-[var(--bits-navy)]">{row.title}</p>
      <p className="mt-2 text-sm text-[var(--bits-navy)]">
        {row.retentionPeriodLabel}
        <span className="text-[var(--bits-muted)]"> · {row.stateLabel}</span>
      </p>
      <p className="mt-1 text-sm text-[var(--bits-navy)]">
        Review {row.reviewDueLabel}
        {row.reviewDue ? " · Needs review" : ""}
      </p>
      <p className="mt-1 text-sm text-[var(--bits-muted)]">
        Updated {row.updatedOnLabel}
      </p>
      <p className="mt-2 text-sm leading-6 text-[var(--bits-navy)]">
        {row.policySummary}
      </p>
      <form action={updateDataRetentionPolicyAction} className="mt-4 grid gap-3">
        <input type="hidden" name="policyId" value={row.id} />
        <label className="text-sm font-medium text-[var(--bits-navy)]">
          Title
          <input
            name="title"
            defaultValue={row.title}
            maxLength={DATA_RETENTION_TITLE_MAX}
            required
            className={fieldClass}
          />
        </label>
        <label className="text-sm font-medium text-[var(--bits-navy)]">
          Retention period (months)
          <input
            name="retentionPeriodMonths"
            type="number"
            min={1}
            max={600}
            defaultValue={row.retentionPeriodMonths ?? ""}
            placeholder="Leave blank for no fixed period"
            className={fieldClass}
          />
        </label>
        <label className="text-sm font-medium text-[var(--bits-navy)]">
          Policy summary
          <textarea
            name="policySummary"
            defaultValue={row.policySummary}
            maxLength={DATA_RETENTION_SUMMARY_MAX}
            rows={3}
            required
            className={fieldClass}
          />
        </label>
        <label className="text-sm font-medium text-[var(--bits-navy)]">
          Review date
          <input
            name="reviewDueAt"
            type="date"
            defaultValue={row.reviewDueAtIso ?? ""}
            className={fieldClass}
          />
        </label>
        <button
          type="submit"
          className={`rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
        >
          Save updates
        </button>
      </form>
      <form
        action={
          row.isActive
            ? deactivateDataRetentionPolicyAction
            : reactivateDataRetentionPolicyAction
        }
        className="mt-3"
      >
        <input type="hidden" name="policyId" value={row.id} />
        <button
          type="submit"
          className={`rounded-xl border border-[var(--bits-border)] px-4 py-2 text-sm font-semibold text-[var(--bits-navy)] ${focusClass}`}
        >
          {row.isActive ? "Deactivate" : "Reactivate"}
        </button>
      </form>
    </li>
  );
}

export default async function DataRetentionPoliciesPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const query = await searchParams;
  const register = await getDataRetentionPolicies();

  if (register.status === "SIGNED_OUT") redirect("/sign-in");
  if (register.status === "NO_ORGANIZATION") redirect("/settings/organization");
  if (register.status === "UNAUTHORIZED") redirect("/dashboard");

  const rows = register.status === "READY" ? register.rows : [];
  const counts =
    register.status === "READY"
      ? register.counts
      : { activePolicies: 0, reviewDue: 0, noFixedPeriod: 0 };
  const occupied = new Set(
    register.status === "READY" ? register.occupiedCategories : [],
  );
  const availableCategories = DATA_RETENTION_CATEGORIES.filter(
    (category) => !occupied.has(category),
  );

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Administration
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
          Data Retention Policies
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          {DATA_RETENTION_POLICIES_SUBTITLE}
        </p>
      </header>

      <aside
        role="note"
        className="rounded-2xl border border-[var(--bits-gold)] bg-white p-4 shadow-sm"
      >
        <p className="text-sm leading-6 text-[var(--bits-navy)]">
          {DATA_RETENTION_POLICIES_NOTICE}
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

      <ul className="grid gap-3 sm:grid-cols-3">
        <li className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-4 shadow-sm">
          <p className="text-sm text-[var(--bits-muted)]">Active Policies</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--bits-navy)]">
            {counts.activePolicies}
          </p>
        </li>
        <li className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-4 shadow-sm">
          <p className="text-sm text-[var(--bits-muted)]">Review Due</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--bits-navy)]">
            {counts.reviewDue}
          </p>
        </li>
        <li className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-4 shadow-sm">
          <p className="text-sm text-[var(--bits-muted)]">No Fixed Period</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--bits-navy)]">
            {counts.noFixedPeriod}
          </p>
        </li>
      </ul>

      <section className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Record a policy
        </h2>
        {availableCategories.length === 0 ? (
          <p className="mt-3 text-sm leading-6 text-[var(--bits-muted)]">
            Every data category already has a recorded policy. Update an
            existing policy below.
          </p>
        ) : (
          <form
            action={createDataRetentionPolicyAction}
            className="mt-4 grid gap-4 md:grid-cols-2"
          >
            <label className="text-sm font-medium text-[var(--bits-navy)]">
              Category
              <select name="category" required className={fieldClass}>
                {availableCategories.map((category: DataRetentionCategory) => (
                  <option key={category} value={category}>
                    {DATA_RETENTION_CATEGORY_LABELS[category]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-[var(--bits-navy)]">
              Title
              <input
                name="title"
                maxLength={DATA_RETENTION_TITLE_MAX}
                required
                className={fieldClass}
              />
            </label>
            <label className="text-sm font-medium text-[var(--bits-navy)]">
              Retention period (months)
              <input
                name="retentionPeriodMonths"
                type="number"
                min={1}
                max={600}
                placeholder="Leave blank for no fixed period"
                className={fieldClass}
              />
            </label>
            <label className="text-sm font-medium text-[var(--bits-navy)]">
              Review date
              <input name="reviewDueAt" type="date" className={fieldClass} />
            </label>
            <label className="text-sm font-medium text-[var(--bits-navy)] md:col-span-2">
              Policy summary
              <textarea
                name="policySummary"
                maxLength={DATA_RETENTION_SUMMARY_MAX}
                rows={4}
                required
                className={fieldClass}
              />
            </label>
            <div className="md:col-span-2">
              <button
                type="submit"
                className={`rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
              >
                Save policy
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Recorded policies
        </h2>
        {rows.length === 0 ? (
          <p className="mt-4 text-sm leading-6 text-[var(--bits-muted)]">
            {DATA_RETENTION_POLICIES_EMPTY_COPY}
          </p>
        ) : (
          <>
            <ul className="mt-4 grid gap-3 lg:hidden">
              {rows.map((row) => (
                <PolicyCard key={row.id} row={row} />
              ))}
            </ul>
            <div className="mt-4 hidden overflow-x-auto lg:block">
              <table className="min-w-full text-left text-sm">
                <caption className="sr-only">
                  Recorded church data retention policies
                </caption>
                <thead>
                  <tr className="border-b border-[var(--bits-border)] text-[var(--bits-muted)]">
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Category
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Retention period
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Review date
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      State
                    </th>
                    <th scope="col" className="py-3 font-medium">
                      Last updated
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
                        {row.categoryLabel}
                        <span className="mt-1 block font-normal text-[var(--bits-muted)]">
                          {row.title}
                        </span>
                      </th>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.retentionPeriodLabel}
                      </td>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.reviewDueLabel}
                        {row.reviewDue ? (
                          <span className="mt-1 block text-sm font-medium text-[var(--bits-navy)]">
                            Needs review
                          </span>
                        ) : null}
                      </td>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.stateLabel}
                      </td>
                      <td className="py-3 text-[var(--bits-navy)]">
                        {row.updatedOnLabel}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="mt-6 hidden gap-4 lg:grid">
              {rows.map((row) => (
                <PolicyCard key={`edit-${row.id}`} row={row} />
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
