import { redirect } from "next/navigation";

import { getPrivacyRequestAccess } from "@/lib/auth/privacy-request-permissions";
import {
  memberPrivacyRequestStatusLabels,
  memberPrivacyRequestTypeLabels,
  staffPrivacyRequestStatusValues,
} from "@/lib/validation/member-privacy-data-request";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";
import { listStaffPrivacyDataRequests } from "@/server/services/member-privacy-data-request.service";

import { updatePrivacyRequestStatusAction } from "./actions";

const fieldClass =
  "mt-1 w-full rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 text-sm";
const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

function formatDate(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(value);
}

export default async function StaffPrivacyRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const organization = await findPrimaryOrganization();
  if (!organization) redirect("/settings/organization");

  const access = await getPrivacyRequestAccess(organization.id);
  if (!access.canReviewPrivacyRequests) redirect("/dashboard");

  const [{ success, error }, queue] = await Promise.all([
    searchParams,
    listStaffPrivacyDataRequests(),
  ]);

  if (queue.status !== "READY") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Administration
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
          Privacy &amp; Data Requests
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          Review requests from signed-in members about their own BITS
          information. This queue does not export, email, or delete records.
        </p>
      </header>

      {success || error ? (
        <p
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm ${
            error
              ? "border-rose-300 bg-rose-50 text-rose-800"
              : "border-emerald-300 bg-emerald-50 text-emerald-800"
          }`}
        >
          {error ?? success}
        </p>
      ) : null}

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        {queue.requests.length ? (
          <ul className="grid gap-4">
            {queue.requests.map((row) => (
              <li
                key={row.id}
                className="rounded-xl border border-[var(--bits-border)] p-4"
              >
                <p className="font-semibold text-[var(--bits-navy)]">
                  {memberPrivacyRequestTypeLabels[row.requestType]}
                </p>
                <p className="mt-1 text-sm text-[var(--bits-muted)]">
                  {memberPrivacyRequestStatusLabels[row.status] ?? row.status}
                  {" · "}
                  {formatDate(row.createdAt)}
                </p>
                <p className="mt-2 text-sm text-[var(--bits-navy)]">
                  Requested by {row.requestingUser.displayName ?? "Member"} ·{" "}
                  {row.requestingUser.primaryEmail}
                  {row.linkedDonor
                    ? ` · Linked donor ${row.linkedDonor.firstName} ${row.linkedDonor.lastName}`
                    : ""}
                </p>
                {row.memberNote ? (
                  <p className="mt-2 text-sm leading-6 text-[var(--bits-navy)]">
                    Member note: {row.memberNote}
                  </p>
                ) : null}
                {row.staffResolutionNote ? (
                  <p className="mt-2 text-sm leading-6 text-[var(--bits-muted)]">
                    Last staff note: {row.staffResolutionNote}
                  </p>
                ) : null}
                <form
                  action={updatePrivacyRequestStatusAction}
                  className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
                >
                  <input type="hidden" name="requestId" value={row.id} />
                  <label className="text-sm font-medium text-[var(--bits-navy)]">
                    Status
                    <select
                      name="status"
                      defaultValue={
                        row.status === "OPEN" ? "IN_REVIEW" : row.status
                      }
                      className={fieldClass}
                    >
                      {staffPrivacyRequestStatusValues.map((status) => (
                        <option key={status} value={status}>
                          {memberPrivacyRequestStatusLabels[status]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium text-[var(--bits-navy)]">
                    Resolution note (optional)
                    <input
                      name="staffResolutionNote"
                      maxLength={1000}
                      defaultValue={row.staffResolutionNote ?? ""}
                      className={fieldClass}
                    />
                  </label>
                  <button
                    type="submit"
                    className={`rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
                  >
                    Save review
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm leading-6 text-[var(--bits-muted)]">
            There are no privacy requests for this church yet.
          </p>
        )}
      </section>
    </div>
  );
}
