import { redirect } from "next/navigation";

import {
  MAINTENANCE_DESCRIPTION_MAX,
  MAINTENANCE_DESCRIPTION_MIN,
  MAINTENANCE_LOCATION_MAX,
  MAINTENANCE_PRIORITY_LABELS,
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_REQUESTS_EMPTY_COPY,
  MAINTENANCE_REQUESTS_NOTICE,
  MAINTENANCE_REQUEST_STATUS_LABELS,
  MAINTENANCE_REQUEST_STATUSES,
  MAINTENANCE_RESOLUTION_MAX,
  MAINTENANCE_RESOLUTION_MIN,
  MAINTENANCE_TITLE_MAX,
  MAINTENANCE_TITLE_MIN,
  isElevatedPriority,
  type MaintenanceRequestRow,
} from "@/lib/validation/maintenance-request";
import { getMaintenanceRequests } from "@/server/services/maintenance-request.service";

import {
  changeMaintenanceRequestStatusAction,
  createMaintenanceRequestAction,
  updateMaintenanceRequestAction,
} from "./actions";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";
const fieldClass =
  "mt-1 w-full rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 text-sm text-[var(--bits-navy)]";

function PriorityLabel({ row }: { row: MaintenanceRequestRow }) {
  return (
    <span
      className={
        isElevatedPriority(row.priority)
          ? "font-semibold text-[var(--bits-gold-hover)]"
          : "text-[var(--bits-navy)]"
      }
    >
      {row.priorityLabel}
    </span>
  );
}

function IssueFields({
  row,
  equipmentOptions,
}: {
  row?: MaintenanceRequestRow;
  equipmentOptions: Array<{ id: string; label: string }>;
}) {
  return (
    <>
      <label className="text-sm font-medium text-[var(--bits-navy)] sm:col-span-2">
        Title
        <input
          name="title"
          required
          minLength={MAINTENANCE_TITLE_MIN}
          maxLength={MAINTENANCE_TITLE_MAX}
          defaultValue={row?.title ?? ""}
          className={fieldClass}
        />
      </label>
      <label className="text-sm font-medium text-[var(--bits-navy)] sm:col-span-2">
        Description
        <textarea
          name="description"
          required
          minLength={MAINTENANCE_DESCRIPTION_MIN}
          maxLength={MAINTENANCE_DESCRIPTION_MAX}
          rows={3}
          defaultValue={row?.description ?? ""}
          className={fieldClass}
        />
      </label>
      <label className="text-sm font-medium text-[var(--bits-navy)]">
        Location
        <input
          name="locationDescription"
          maxLength={MAINTENANCE_LOCATION_MAX}
          defaultValue={row?.locationDescription ?? ""}
          placeholder="Main Sanctuary, kitchen"
          className={fieldClass}
        />
      </label>
      <label className="text-sm font-medium text-[var(--bits-navy)]">
        Linked equipment
        <select
          name="equipmentItemId"
          defaultValue={row?.equipmentItemId ?? ""}
          className={fieldClass}
        >
          <option value="">No linked equipment</option>
          {equipmentOptions.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium text-[var(--bits-navy)]">
        Priority
        <select
          name="priority"
          defaultValue={row?.priority ?? "NORMAL"}
          className={fieldClass}
        >
          {MAINTENANCE_PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {MAINTENANCE_PRIORITY_LABELS[priority]}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

export default async function MaintenanceRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    priority?: string;
    equipmentItemId?: string;
    success?: string;
    error?: string;
  }>;
}) {
  const query = await searchParams;
  const review = await getMaintenanceRequests(query);

  if (review.status === "SIGNED_OUT") redirect("/sign-in");
  if (review.status === "NO_ORGANIZATION") redirect("/settings/organization");
  if (review.status === "UNAUTHORIZED") redirect("/dashboard");

  const rows = review.status === "READY" ? review.rows : [];
  const counts =
    review.status === "READY"
      ? review.counts
      : { open: 0, inProgress: 0, completed: 0, urgent: 0 };
  const canManage = review.status === "READY" ? review.canManage : false;
  const equipmentOptions =
    review.status === "READY" ? review.equipmentOptions : [];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Church Life
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
          Maintenance Requests
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          {MAINTENANCE_REQUESTS_NOTICE}
        </p>
      </header>

      {review.status === "INVALID_FILTER" ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          Choose a valid maintenance request filter.
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

      <section
        aria-label="Maintenance request counts"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {[
          { label: "Open", value: counts.open },
          { label: "In Progress", value: counts.inProgress },
          { label: "Completed", value: counts.completed },
          { label: "Urgent", value: counts.urgent },
        ].map((card) => (
          <article
            key={card.label}
            className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-4 shadow-sm"
          >
            <h2 className="text-xs font-medium text-[var(--bits-muted)]">
              {card.label}
            </h2>
            <p className="mt-2 text-2xl font-semibold text-[var(--bits-navy)]">
              {card.value}
            </p>
          </article>
        ))}
      </section>

      {canManage ? (
        <section className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
            Report an Issue
          </h2>
          <form
            action={createMaintenanceRequestAction}
            className="mt-4 grid gap-4 sm:grid-cols-2"
          >
            <IssueFields equipmentOptions={equipmentOptions} />
            <div className="sm:col-span-2">
              <button
                type="submit"
                className={`rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
              >
                Report an Issue
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <form
        method="get"
        className="grid gap-4 rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-4"
      >
        <label className="text-sm font-medium text-[var(--bits-navy)]">
          Search
          <input name="q" defaultValue={query.q ?? ""} className={fieldClass} />
        </label>
        <label className="text-sm font-medium text-[var(--bits-navy)]">
          Status
          <select
            name="status"
            defaultValue={query.status ?? ""}
            className={fieldClass}
          >
            <option value="">All statuses</option>
            {MAINTENANCE_REQUEST_STATUSES.map((status) => (
              <option key={status} value={status}>
                {MAINTENANCE_REQUEST_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-[var(--bits-navy)]">
          Priority
          <select
            name="priority"
            defaultValue={query.priority ?? ""}
            className={fieldClass}
          >
            <option value="">All priorities</option>
            {MAINTENANCE_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {MAINTENANCE_PRIORITY_LABELS[priority]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-[var(--bits-navy)]">
          Equipment
          <select
            name="equipmentItemId"
            defaultValue={query.equipmentItemId ?? ""}
            className={fieldClass}
          >
            <option value="">All equipment</option>
            {equipmentOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <div className="lg:col-span-4">
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
          Requests
        </h2>
        {rows.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--bits-muted)]">
            {MAINTENANCE_REQUESTS_EMPTY_COPY}
          </p>
        ) : (
          <>
            <ul className="mt-4 grid gap-4 lg:hidden">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="rounded-xl border border-[var(--bits-border)] bg-[var(--bits-page)] p-4"
                >
                  <RequestSummary row={row} />
                  {canManage ? (
                    <ManagerControls
                      row={row}
                      equipmentOptions={equipmentOptions}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="mt-4 hidden overflow-x-auto lg:block">
              <table className="min-w-full text-left text-sm">
                <caption className="sr-only">Church maintenance requests</caption>
                <thead>
                  <tr className="border-b border-[var(--bits-border)] text-[var(--bits-muted)]">
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Title
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Equipment
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Location
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Priority
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Status
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Reported
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Assigned
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
                        {row.equipmentName ?? "—"}
                      </td>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.locationDescription ?? "—"}
                      </td>
                      <td className="py-3 pr-4">
                        <PriorityLabel row={row} />
                      </td>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.statusLabel}
                      </td>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.reportedOnLabel}
                      </td>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.assignedToName ?? "—"}
                      </td>
                      <td className="py-3">
                        <a
                          href={`#request-${row.id}`}
                          className={`text-sm font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
                        >
                          {canManage ? "Review" : "View"}
                          <span className="sr-only"> {row.title}</span>
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canManage ? (
              <ul className="mt-6 hidden gap-4 lg:grid">
                {rows.map((row) => (
                  <li key={`edit-${row.id}`} id={`request-${row.id}`}>
                    <details className="rounded-xl border border-[var(--bits-border)] p-4">
                      <summary
                        className={`cursor-pointer text-sm font-semibold text-[var(--bits-navy)] ${focusClass}`}
                      >
                        Review {row.title}
                      </summary>
                      <p className="mt-3 text-sm leading-6 text-[var(--bits-muted)]">
                        {row.description}
                      </p>
                      <ManagerControls
                        row={row}
                        equipmentOptions={equipmentOptions}
                      />
                    </details>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="mt-6 hidden gap-4 lg:grid">
                {rows.map((row) => (
                  <li
                    key={`view-${row.id}`}
                    id={`request-${row.id}`}
                    className="rounded-xl border border-[var(--bits-border)] p-4"
                  >
                    <h3 className="font-semibold text-[var(--bits-navy)]">
                      {row.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-[var(--bits-muted)]">
                      {row.description}
                    </p>
                    {row.resolutionNote ? (
                      <p className="mt-2 text-sm text-[var(--bits-navy)]">
                        Resolution: {row.resolutionNote}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function RequestSummary({ row }: { row: MaintenanceRequestRow }) {
  return (
    <>
      <h3 className="text-lg font-semibold text-[var(--bits-navy)]">
        {row.title}
      </h3>
      <p className="mt-1 text-sm text-[var(--bits-muted)]">
        {row.equipmentName ?? "Facility"} · {row.locationDescription ?? "No location"}
      </p>
      <p className="mt-2 text-sm text-[var(--bits-navy)]">
        <PriorityLabel row={row} /> · {row.statusLabel}
      </p>
      <p className="mt-1 text-sm text-[var(--bits-muted)]">
        Reported {row.reportedOnLabel}
        {row.assignedToName ? ` · Assigned to ${row.assignedToName}` : ""}
      </p>
      <p className="mt-2 text-sm leading-6 text-[var(--bits-navy)]">
        {row.description}
      </p>
      {row.resolutionNote ? (
        <p className="mt-2 text-sm text-[var(--bits-muted)]">
          Resolution: {row.resolutionNote}
        </p>
      ) : null}
    </>
  );
}

function ManagerControls({
  row,
  equipmentOptions,
}: {
  row: MaintenanceRequestRow;
  equipmentOptions: Array<{ id: string; label: string }>;
}) {
  const closed = row.status === "COMPLETED" || row.status === "CANCELLED";

  return (
    <div className="mt-4 grid gap-4">
      {closed ? null : (
        <form
          action={updateMaintenanceRequestAction}
          className="grid gap-4 sm:grid-cols-2"
        >
          <input type="hidden" name="requestId" value={row.id} />
          <IssueFields row={row} equipmentOptions={equipmentOptions} />
          <div className="sm:col-span-2">
            <button
              type="submit"
              className={`rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
            >
              Save changes
              <span className="sr-only"> {row.title}</span>
            </button>
          </div>
        </form>
      )}
      {closed ? null : (
        <div className="grid gap-4 sm:grid-cols-2">
          {row.status === "OPEN" ? (
            <form action={changeMaintenanceRequestStatusAction}>
              <input type="hidden" name="requestId" value={row.id} />
              <input type="hidden" name="status" value="IN_PROGRESS" />
              <button
                type="submit"
                className={`rounded-xl border border-[var(--bits-border)] px-4 py-2 text-sm font-semibold text-[var(--bits-navy)] ${focusClass}`}
              >
                Mark in progress
                <span className="sr-only"> {row.title}</span>
              </button>
            </form>
          ) : null}
          <form
            action={changeMaintenanceRequestStatusAction}
            className="grid gap-2"
          >
            <input type="hidden" name="requestId" value={row.id} />
            <input type="hidden" name="status" value="COMPLETED" />
            <label className="text-sm font-medium text-[var(--bits-navy)]">
              Resolution note
              <textarea
                name="resolutionNote"
                required
                minLength={MAINTENANCE_RESOLUTION_MIN}
                maxLength={MAINTENANCE_RESOLUTION_MAX}
                rows={2}
                className={fieldClass}
              />
            </label>
            <button
              type="submit"
              className={`w-fit rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
            >
              Complete
              <span className="sr-only"> {row.title}</span>
            </button>
          </form>
          <form
            action={changeMaintenanceRequestStatusAction}
            className="grid gap-2"
          >
            <input type="hidden" name="requestId" value={row.id} />
            <input type="hidden" name="status" value="CANCELLED" />
            <label className="text-sm font-medium text-[var(--bits-navy)]">
              Cancellation reason
              <textarea
                name="resolutionNote"
                required
                minLength={MAINTENANCE_RESOLUTION_MIN}
                maxLength={MAINTENANCE_RESOLUTION_MAX}
                rows={2}
                className={fieldClass}
              />
            </label>
            <button
              type="submit"
              className={`w-fit rounded-xl border border-[var(--bits-border)] px-4 py-2 text-sm font-semibold text-[var(--bits-navy)] ${focusClass}`}
            >
              Cancel request
              <span className="sr-only"> {row.title}</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
