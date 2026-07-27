"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  checkInAttendeeAction,
  checkInByTokenAction,
  exportRegistrationsCsvAction,
  promoteWaitlistAction,
  staffAddRegistrationAction,
  staffCancelRegistrationAction,
} from "@/app/(staff)/events/registration-actions";
import { StaffQrPassPanel } from "@/components/events/staff-qr-pass-panel";
import {
  eventRegistrationStatusOptions,
  formatRegistrationEnumLabel,
} from "@/lib/constants/event-registration";

type Attendee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  status: string;
  isGuest: boolean;
  checkedInAt: Date | string | null;
  eventId: string;
  checkInToken: string | null;
  qrPayload?: string;
};

type Registration = {
  id: string;
  confirmationCode: string;
  status: string;
  primaryContactName: string;
  primaryContactEmail: string | null;
  partySize: number;
  waitlistPosition: number | null;
  createdAt: Date | string;
  attendees: Attendee[];
};

type Summary = {
  confirmedCount: number;
  waitlistCount: number;
  capacity: number | null;
  capacityRemaining: number | null;
};

type Props = {
  eventId: string;
  eventSlug: string;
  registrations: Registration[];
  summary: Summary;
  access: {
    canManageRegistration: boolean;
    canCheckIn: boolean;
    canExportRegistrations: boolean;
    /** Issue/rotate/revoke QR passes (7.3Q/7.3R/7.3S). */
    canManageQrPass?: boolean;
  };
};

export function EventAttendeesPanel({
  eventId,
  eventSlug,
  registrations,
  summary,
  access,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const confirmed = registrations.filter((r) =>
    ["PENDING", "CONFIRMED", "CHECKED_IN"].includes(r.status),
  );
  const offered = registrations.filter((r) => r.status === "OFFERED");
  const waitlisted = registrations.filter((r) => r.status === "WAITLISTED");
  const cancelled = registrations.filter((r) =>
    ["CANCELLED", "DECLINED", "EXPIRED"].includes(r.status),
  );

  function run(action: () => Promise<{ status: string; message: string }>) {
    startTransition(async () => {
      const result = await action();
      setMessage(result.message);
      router.refresh();
    });
  }

  function downloadCsv() {
    startTransition(async () => {
      const result = await exportRegistrationsCsvAction(eventId);
      if (result.status !== "success" || !("csv" in result) || !result.csv) {
        setMessage(result.message);
        return;
      }
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.filename ?? "registrations.csv";
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage("CSV downloaded.");
    });
  }

  return (
    <div className={`space-y-6 ${isPending ? "opacity-70" : ""}`}>
      {message ? (
        <p className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          {message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Attendees
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Confirmed {summary.confirmedCount}
            {summary.capacity != null ? ` / ${summary.capacity}` : ""}
            {summary.capacityRemaining != null
              ? ` · ${summary.capacityRemaining} remaining`
              : ""}
            {summary.waitlistCount > 0
              ? ` · Waitlist ${summary.waitlistCount}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/register/${eventSlug}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium dark:border-zinc-700"
          >
            Public register link
          </a>
          {access.canExportRegistrations ? (
            <button
              type="button"
              onClick={downloadCsv}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium dark:border-zinc-700"
            >
              Export CSV
            </button>
          ) : null}
          {access.canManageRegistration ? (
            <button
              type="button"
              onClick={() => setShowAdd((v) => !v)}
              className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              {showAdd ? "Hide add form" : "Add registration"}
            </button>
          ) : null}
        </div>
      </div>

      {access.canCheckIn ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Check-in
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            Paste a signed QR payload or scan token. Production should set{" "}
            <code className="font-mono">BITS_CHECKIN_HMAC_SECRET</code>.
          </p>
          <form
            className="mt-3 flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData();
              formData.set("eventId", eventId);
              formData.set("token", token);
              run(() => checkInByTokenAction(formData));
              setToken("");
            }}
          >
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste check-in token"
              className="min-w-[16rem] flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Check in
            </button>
          </form>
        </section>
      ) : null}

      {showAdd && access.canManageRegistration ? (
        <StaffAddRegistrationForm
          eventId={eventId}
          onDone={(msg) => {
            setMessage(msg);
            setShowAdd(false);
            router.refresh();
          }}
        />
      ) : null}

      <RegistrationList
        title="Confirmed / active"
        empty="No confirmed registrations yet."
        items={confirmed}
        eventId={eventId}
        access={access}
        onCheckIn={(id) => run(() => checkInAttendeeAction(id))}
        onCancel={(code) => {
          const formData = new FormData();
          formData.set("confirmationCode", code);
          formData.set("reason", "Cancelled by staff");
          run(() => staffCancelRegistrationAction(formData));
        }}
      />

      <RegistrationList
        title="Waitlist"
        empty="Waitlist is empty."
        items={waitlisted}
        eventId={eventId}
        access={access}
        onPromote={(id) => run(() => promoteWaitlistAction(id))}
        onCancel={(code) => {
          const formData = new FormData();
          formData.set("confirmationCode", code);
          formData.set("reason", "Cancelled by staff");
          run(() => staffCancelRegistrationAction(formData));
        }}
      />

      {offered.length > 0 ? (
        <RegistrationList
          title="Promotion offers pending"
          empty=""
          items={offered}
          eventId={eventId}
          access={access}
          onCancel={(code) => {
            const formData = new FormData();
            formData.set("confirmationCode", code);
            formData.set("reason", "Offer cancelled by staff");
            run(() => staffCancelRegistrationAction(formData));
          }}
        />
      ) : null}

      {cancelled.length > 0 ? (
        <RegistrationList
          title="Cancelled / declined / expired"
          empty=""
          items={cancelled}
          eventId={eventId}
          access={access}
        />
      ) : null}
    </div>
  );
}

function RegistrationList({
  title,
  empty,
  items,
  eventId,
  access,
  onCheckIn,
  onPromote,
  onCancel,
}: {
  title: string;
  empty: string;
  items: Registration[];
  eventId: string;
  access: Props["access"];
  onCheckIn?: (attendeeId: string) => void;
  onPromote?: (registrationId: string) => void;
  onCancel?: (confirmationCode: string) => void;
}) {
  const canManageQrPass = Boolean(
    access.canManageQrPass ??
      access.canCheckIn ??
      access.canManageRegistration,
  );
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
          {items.map((registration) => (
            <li key={registration.id} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {registration.primaryContactName}{" "}
                    <span className="font-mono text-xs text-zinc-500">
                      {registration.confirmationCode}
                    </span>
                  </p>
                  <p className="text-xs text-zinc-500">
                    {formatRegistrationEnumLabel(
                      eventRegistrationStatusOptions,
                      registration.status,
                    )}
                    {" · "}
                    party of {registration.partySize}
                    {registration.waitlistPosition != null
                      ? ` · waitlist #${registration.waitlistPosition}`
                      : ""}
                    {registration.primaryContactEmail
                      ? ` · ${registration.primaryContactEmail}`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {onPromote && access.canManageRegistration ? (
                    <button
                      type="button"
                      className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700"
                      onClick={() => onPromote(registration.id)}
                    >
                      Send offer
                    </button>
                  ) : null}
                  {onCancel && access.canManageRegistration ? (
                    <button
                      type="button"
                      className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 dark:border-red-900 dark:text-red-300"
                      onClick={() => onCancel(registration.confirmationCode)}
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>
              <ul className="mt-2 space-y-1 pl-2 text-sm text-zinc-600 dark:text-zinc-300">
                {registration.attendees.map((attendee) => (
                  <li
                    key={attendee.id}
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <span>
                      {attendee.firstName} {attendee.lastName}
                      {attendee.isGuest ? " (guest)" : ""}
                      {attendee.checkedInAt ? " · checked in" : ""}
                      {access.canCheckIn && attendee.qrPayload ? (
                        <span
                          className="ml-2 font-mono text-[10px] text-zinc-400"
                          title={attendee.qrPayload}
                        >
                          QR: {attendee.qrPayload.slice(0, 24)}…
                        </span>
                      ) : null}
                    </span>
                    {onCheckIn &&
                    access.canCheckIn &&
                    attendee.status !== "CHECKED_IN" &&
                    attendee.status !== "CANCELLED" ? (
                      <button
                        type="button"
                        className="rounded border border-zinc-300 px-2 py-0.5 text-xs dark:border-zinc-700"
                        onClick={() => onCheckIn(attendee.id)}
                      >
                        Check in
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
              {canManageQrPass &&
              ["CONFIRMED", "CHECKED_IN"].includes(registration.status) ? (
                <StaffQrPassPanel
                  key={registration.id}
                  eventId={eventId}
                  registrationId={registration.id}
                  confirmationCode={registration.confirmationCode}
                  registrationStatus={registration.status}
                  attendees={registration.attendees.map((attendee) => ({
                    id: attendee.id,
                    firstName: attendee.firstName,
                    lastName: attendee.lastName,
                    status: attendee.status,
                  }))}
                  canManage={canManageQrPass}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StaffAddRegistrationForm({
  eventId,
  onDone,
}: {
  eventId: string;
  onDone: (message: string) => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);
        formData.set("eventId", eventId);
        formData.set(
          "attendeesJson",
          JSON.stringify([
            {
              firstName: String(formData.get("firstName") ?? ""),
              lastName: String(formData.get("lastName") ?? ""),
              email: String(formData.get("email") ?? ""),
              phone: String(formData.get("phone") ?? ""),
              isGuest: formData.get("isGuest") === "on",
            },
          ]),
        );
        startTransition(async () => {
          const result = await staffAddRegistrationAction(formData);
          onDone(result.message);
          if (result.status === "success") form.reset();
        });
      }}
    >
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        Manual registration
      </h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <input
          name="primaryContactName"
          required
          placeholder="Contact name"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <input
          name="primaryContactEmail"
          type="email"
          placeholder="Contact email"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <input
          name="firstName"
          required
          placeholder="Attendee first name"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <input
          name="lastName"
          required
          placeholder="Attendee last name"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <input
          name="email"
          type="email"
          placeholder="Attendee email"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <input
          name="phone"
          placeholder="Phone"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <input type="checkbox" name="isGuest" /> Guest
        </label>
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="mt-3 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        {isPending ? "Saving…" : "Add registration"}
      </button>
    </form>
  );
}
