import { redirect } from "next/navigation";

import { ConfirmSubmitButton } from "@/components/service-alerts/confirm-submit-button";
import {
  CHURCH_SERVICE_ALERT_MESSAGE_MAX,
  CHURCH_SERVICE_ALERT_TITLE_MAX,
  CHURCH_SERVICE_ALERT_TYPE_LABELS,
  CHURCH_SERVICE_ALERT_TYPES,
  CHURCH_SERVICE_ALERTS_EMPTY_COPY,
  CHURCH_SERVICE_ALERTS_NOTICE,
  CHURCH_SERVICE_ALERTS_SUBTITLE,
  type ChurchServiceAlertStaffRow,
  type ChurchServiceAlertType,
} from "@/lib/validation/church-service-alert";
import { getChurchServiceAlerts } from "@/server/services/church-service-alert.service";

import {
  archiveChurchServiceAlertAction,
  createChurchServiceAlertAction,
  publishChurchServiceAlertAction,
  updateChurchServiceAlertAction,
} from "./actions";

const fieldClass =
  "mt-1 w-full rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 text-sm text-[var(--bits-navy)]";
const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

function TypeSelect({
  defaultValue,
}: {
  defaultValue?: ChurchServiceAlertType;
}) {
  return (
    <label className="text-sm font-medium text-[var(--bits-navy)]">
      Type
      <select
        name="alertType"
        required
        defaultValue={defaultValue ?? "WEATHER"}
        className={fieldClass}
      >
        {CHURCH_SERVICE_ALERT_TYPES.map((type) => (
          <option key={type} value={type}>
            {CHURCH_SERVICE_ALERT_TYPE_LABELS[type]}
          </option>
        ))}
      </select>
    </label>
  );
}

function AlertFields({ row }: { row?: ChurchServiceAlertStaffRow }) {
  return (
    <>
      <TypeSelect defaultValue={row?.alertType} />
      <label className="text-sm font-medium text-[var(--bits-navy)]">
        Title
        <input
          name="title"
          required
          minLength={3}
          maxLength={CHURCH_SERVICE_ALERT_TITLE_MAX}
          defaultValue={row?.title ?? ""}
          className={fieldClass}
        />
      </label>
      <label className="text-sm font-medium text-[var(--bits-navy)] md:col-span-2">
        Message
        <textarea
          name="message"
          required
          minLength={10}
          maxLength={CHURCH_SERVICE_ALERT_MESSAGE_MAX}
          rows={3}
          defaultValue={row?.message ?? ""}
          className={fieldClass}
        />
      </label>
      <label className="text-sm font-medium text-[var(--bits-navy)]">
        Starts
        <input
          name="startsAt"
          type="datetime-local"
          required
          defaultValue={row?.startsAtLocal ?? ""}
          className={fieldClass}
        />
      </label>
      <label className="text-sm font-medium text-[var(--bits-navy)]">
        Expires
        <input
          name="expiresAt"
          type="datetime-local"
          required
          defaultValue={row?.expiresAtLocal ?? ""}
          className={fieldClass}
        />
      </label>
    </>
  );
}

function ActiveAlert({ row }: { row: ChurchServiceAlertStaffRow }) {
  return (
    <section className="rounded-2xl border border-[var(--bits-gold)] bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--bits-gold-dark)]">
        Current public alert
      </p>
      <p className="mt-2 text-sm font-medium text-[var(--bits-navy)]">
        {row.typeLabel}
      </p>
      <h2 className="mt-1 text-xl font-semibold text-[var(--bits-navy)]">
        {row.title}
      </h2>
      <p className="mt-2 text-sm leading-6 text-[var(--bits-navy)]">
        {row.message}
      </p>
      <p className="mt-2 text-sm text-[var(--bits-muted)]">{row.timingLabel}</p>
      <form action={archiveChurchServiceAlertAction} className="mt-4">
        <input type="hidden" name="alertId" value={row.id} />
        <ConfirmSubmitButton
          message="Archive this alert? It will disappear from the public home page immediately. History will be kept."
          className={`rounded-xl border border-[var(--bits-border)] px-4 py-2 text-sm font-semibold text-[var(--bits-navy)] ${focusClass}`}
        >
          Archive
        </ConfirmSubmitButton>
      </form>
    </section>
  );
}

function AlertHistoryCard({ row }: { row: ChurchServiceAlertStaffRow }) {
  return (
    <li className="rounded-xl border border-[var(--bits-border)] p-4">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--bits-gold-dark)]">
        {row.typeLabel} · {row.statusLabel}
      </p>
      <p className="mt-1 font-semibold text-[var(--bits-navy)]">{row.title}</p>
      <p className="mt-1 text-sm leading-6 text-[var(--bits-navy)]">
        {row.message}
      </p>
      <p className="mt-1 text-sm text-[var(--bits-muted)]">{row.timingLabel}</p>
      {row.status === "DRAFT" ? (
        <form
          action={updateChurchServiceAlertAction}
          className="mt-4 grid gap-4 md:grid-cols-2"
        >
          <input type="hidden" name="alertId" value={row.id} />
          <AlertFields row={row} />
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <button
              type="submit"
              className={`rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
            >
              Save Draft
            </button>
            <ConfirmSubmitButton
              name="intent"
              value="publish"
              message="Publish this alert? It will appear on the public BITS home page while it is active. Any currently active published alert will be archived."
              className={`rounded-xl bg-[var(--bits-gold)] px-4 py-2 text-sm font-bold text-[var(--bits-navy-deep)] ${focusClass}`}
              formAction={publishChurchServiceAlertAction}
            >
              Publish
            </ConfirmSubmitButton>
            <ConfirmSubmitButton
              message="Archive this draft? It will not be published."
              className={`rounded-xl border border-[var(--bits-border)] px-4 py-2 text-sm font-semibold text-[var(--bits-navy)] ${focusClass}`}
              formAction={archiveChurchServiceAlertAction}
            >
              Archive
            </ConfirmSubmitButton>
          </div>
        </form>
      ) : null}
      {row.status === "PUBLISHED" ? (
        <form action={archiveChurchServiceAlertAction} className="mt-4">
          <input type="hidden" name="alertId" value={row.id} />
          <ConfirmSubmitButton
            message="Archive this alert? It will disappear from the public home page immediately. History will be kept."
            className={`rounded-xl border border-[var(--bits-border)] px-4 py-2 text-sm font-semibold text-[var(--bits-navy)] ${focusClass}`}
          >
            Archive
          </ConfirmSubmitButton>
        </form>
      ) : null}
    </li>
  );
}

export default async function ChurchServiceAlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const query = await searchParams;
  const alerts = await getChurchServiceAlerts();

  if (alerts.status === "SIGNED_OUT") redirect("/sign-in");
  if (alerts.status === "NO_ORGANIZATION") redirect("/settings/organization");
  if (alerts.status === "UNAUTHORIZED") redirect("/dashboard");

  const rows = alerts.status === "READY" ? alerts.rows : [];
  const active = alerts.status === "READY" ? alerts.active : null;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Church Life
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
          Church Service Alerts
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          {CHURCH_SERVICE_ALERTS_SUBTITLE}
        </p>
      </header>

      <aside
        role="note"
        className="rounded-2xl border border-[var(--bits-gold)] bg-white p-4 shadow-sm"
      >
        <p className="text-sm leading-6 text-[var(--bits-navy)]">
          {CHURCH_SERVICE_ALERTS_NOTICE}
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

      {active ? <ActiveAlert row={active} /> : null}

      <section className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Create a service alert
        </h2>
        <form
          action={createChurchServiceAlertAction}
          className="mt-4 grid gap-4 md:grid-cols-2"
        >
          <AlertFields />
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <button
              type="submit"
              className={`rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
            >
              Save Draft
            </button>
            <ConfirmSubmitButton
              message="Publish this alert? It will appear on the public BITS home page while it is active. Any currently active published alert will be archived."
              className={`rounded-xl bg-[var(--bits-gold)] px-4 py-2 text-sm font-bold text-[var(--bits-navy-deep)] ${focusClass}`}
              formAction={publishChurchServiceAlertAction}
            >
              Publish
            </ConfirmSubmitButton>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Recent alerts
        </h2>
        {rows.length === 0 ? (
          <p className="mt-4 text-sm leading-6 text-[var(--bits-muted)]">
            {CHURCH_SERVICE_ALERTS_EMPTY_COPY}
          </p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {rows.map((row) => (
              <AlertHistoryCard key={row.id} row={row} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
