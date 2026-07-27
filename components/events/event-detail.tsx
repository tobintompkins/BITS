"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  archiveEventAction,
  cancelEventAction,
  deleteDraftEventAction,
  duplicateEventAction,
  publishEventAction,
  removeEventImageAction,
} from "@/app/(staff)/events/actions";
import { CheckInSettingsPanel } from "@/components/events/check-in-settings-panel";
import { EventAttendeesPanel } from "@/components/events/event-attendees-panel";
import {
  EventStatusBadge,
  EventVisibilityBadge,
  RegistrationBadge,
} from "@/components/events/event-badges";
import { RegistrationSettingsPanel } from "@/components/events/registration-settings-panel";
import { canShowCheckInStationsNav } from "@/lib/auth/check-in-station-nav";
import { formatEventEnumLabel, eventOrganizerRoleOptions } from "@/lib/constants/events";

type EventDetailProps = {
  event: {
    id: string;
    title: string;
    slug: string;
    description: string | null;
    shortDescription: string | null;
    eventStatus: string;
    visibility: string;
    startDateTime: Date | string;
    endDateTime: Date | string;
    timezone: string;
    isAllDay: boolean;
    registrationRequired: boolean;
    registrationOpenDate: Date | string | null;
    registrationCloseDate: Date | string | null;
    registrationCapacity: number | null;
    waitlistEnabled: boolean;
    registrationFee: unknown;
    registrationInstructions: string | null;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    featuredImageUrl: string | null;
    isRecurring: boolean;
    recurrenceRule: string | null;
    recurrenceEndDate: Date | string | null;
    parentEventId: string | null;
    createdAt: Date | string;
    updatedAt: Date | string;
    publishedAt: Date | string | null;
    category: { name: string; color: string | null } | null;
    location: {
      name: string;
      roomName: string | null;
      isOnline: boolean;
      city: string | null;
      state: string | null;
    } | null;
    organizers: Array<{
      id: string;
      organizerName: string | null;
      organizerEmail: string | null;
      role: string;
      isPrimary: boolean;
      user: { displayName: string | null; primaryEmail: string } | null;
      member: {
        firstName: string;
        lastName: string;
        preferredName: string | null;
      } | null;
    }>;
    ministries: Array<{
      id: string;
      isPrimary: boolean;
      ministry: { id: string; name: string };
    }>;
    createdBy: { displayName: string | null; primaryEmail: string } | null;
    updatedBy: { displayName: string | null; primaryEmail: string } | null;
    parentEvent: { id: string; title: string } | null;
    _count: { occurrences: number; attendances: number };
  };
  activity: Array<{
    id: string;
    action: string;
    occurredAt: Date | string;
    actor: { displayName: string | null; primaryEmail: string } | null;
  }>;
  access: {
    canEdit: boolean;
    canPublish: boolean;
    canCancel: boolean;
    canArchive: boolean;
    canDeleteDraft: boolean;
    canCreate: boolean;
    canManageRegistration: boolean;
    canCheckIn: boolean;
    canManageCheckIn?: boolean;
    canExportRegistrations: boolean;
  };
  checkInSettings?: {
    eventId: string;
    checkInEnabled: boolean;
    checkInOpensAt: Date | string | null;
    checkInClosesAt: Date | string | null;
    allowSelfCheckIn: boolean;
    allowWalkIns: boolean;
    allowCheckOut: boolean;
    allowReentry: boolean;
    requireRegistration: boolean;
    qrPassEnabled: boolean;
    stationNameRequired: boolean;
  } | null;
  registration?: {
    settings: {
      eventId: string;
      isEnabled: boolean;
      visibility: string;
      opensAt: Date | string | null;
      closesAt: Date | string | null;
      capacity: number | null;
      waitlistEnabled: boolean;
      waitlistCapacity: number | null;
      promotionMode: string;
      maxAttendeesPerRegistration: number;
      allowHouseholdRegistration: boolean;
      allowGuestRegistration: boolean;
      requireAuthentication: boolean;
      requireEmail: boolean;
      requirePhone: boolean;
      requireDateOfBirth: boolean;
      requireEmergencyContact: boolean;
      requireGuardianForMinors: boolean;
      allowCancellation: boolean;
      cancellationDeadline: Date | string | null;
      confirmationMessage: string | null;
      instructions: string | null;
      checkInEnabled: boolean;
      qrCheckInEnabled: boolean;
      showCapacityPublicly: boolean;
      showWaitlistPublicly: boolean;
      confirmationRequired: boolean;
      promotionOfferTtlMinutes: number;
    } | null;
    registrations: Array<{
      id: string;
      confirmationCode: string;
      status: string;
      primaryContactName: string;
      primaryContactEmail: string | null;
      partySize: number;
      waitlistPosition: number | null;
      createdAt: Date | string;
      attendees: Array<{
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
      }>;
    }>;
    summary: {
      confirmedCount: number;
      waitlistCount: number;
      capacity: number | null;
      capacityRemaining: number | null;
    };
  };
};

function formatDateTime(value: Date | string, allDay: boolean) {
  const date = new Date(value);
  if (allDay) {
    return date.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function organizerLabel(org: EventDetailProps["event"]["organizers"][number]) {
  if (org.organizerName) return org.organizerName;
  if (org.user) return org.user.displayName || org.user.primaryEmail;
  if (org.member) {
    return `${org.member.preferredName || org.member.firstName} ${org.member.lastName}`;
  }
  return "Organizer";
}

export function EventDetail({
  event,
  activity,
  access,
  registration,
  checkInSettings,
}: EventDetailProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tab, setTab] = useState<
    "overview" | "attendees" | "settings" | "checkin"
  >("overview");

  function run(action: () => Promise<{ status: string; message: string; id?: string }>) {
    startTransition(async () => {
      const result = await action();
      setMessage(result.message);
      if (result.status === "success" && result.id) {
        router.push(`/events/${result.id}`);
      }
      if (result.message.toLowerCase().includes("deleted")) {
        router.push("/events");
      }
      router.refresh();
      setMenuOpen(false);
    });
  }

  return (
    <div className={`space-y-6 ${isPending ? "opacity-70" : ""}`}>
      {message ? (
        <p className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          {message}
        </p>
      ) : null}

      <header className="flex flex-col gap-4 border-b border-zinc-200 pb-6 dark:border-zinc-800 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <EventStatusBadge status={event.eventStatus} />
            <EventVisibilityBadge visibility={event.visibility} />
            <RegistrationBadge
              required={event.registrationRequired}
              capacity={event.registrationCapacity}
            />
            {event.isRecurring ? (
              <span className="text-xs font-medium text-zinc-500">Recurring</span>
            ) : null}
          </div>
          <h1
            className={`text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 ${
              event.eventStatus === "CANCELLED" ? "line-through" : ""
            }`}
          >
            {event.title}
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            {event.category?.name ?? "Uncategorized"} ·{" "}
            {formatDateTime(event.startDateTime, event.isAllDay)}
            {event.location ? ` · ${event.location.name}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {access.canEdit ? (
            <Link
              href={`/events/${event.id}/edit`}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Edit
            </Link>
          ) : null}
          {access.canManageRegistration ? (
            <Link
              href={`/events/${event.id}/registrations`}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
            >
              Registrations
            </Link>
          ) : null}
          {access.canCheckIn ? (
            <>
              <Link
                href={`/events/${event.id}/staff-check-in`}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
              >
                Staff check-in
              </Link>
              <Link
                href={`/events/${event.id}/check-in`}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
              >
                Check-in console
              </Link>
              <Link
                href={`/events/${event.id}/attendance`}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
              >
                Attendance
              </Link>
            </>
          ) : null}
          {canShowCheckInStationsNav(access) ? (
            <Link
              href={`/events/${event.id}/check-in-stations`}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
            >
              Check-in stations
            </Link>
          ) : null}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
            >
              More actions
            </button>
            {menuOpen ? (
              <div className="absolute right-0 z-10 mt-2 w-48 rounded-md border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                {access.canCreate ? (
                  <button
                    type="button"
                    className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    onClick={() => run(() => duplicateEventAction(event.id))}
                  >
                    Duplicate
                  </button>
                ) : null}
                {access.canPublish && event.eventStatus === "DRAFT" ? (
                  <button
                    type="button"
                    className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    onClick={() => run(() => publishEventAction(event.id))}
                  >
                    Publish
                  </button>
                ) : null}
                {access.canCancel && event.eventStatus !== "CANCELLED" ? (
                  <button
                    type="button"
                    className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    onClick={() => run(() => cancelEventAction(event.id))}
                  >
                    Cancel event
                  </button>
                ) : null}
                {access.canArchive && event.eventStatus !== "ARCHIVED" ? (
                  <button
                    type="button"
                    className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    onClick={() => run(() => archiveEventAction(event.id))}
                  >
                    Archive
                  </button>
                ) : null}
                {access.canDeleteDraft && event.eventStatus === "DRAFT" ? (
                  <button
                    type="button"
                    className="block w-full rounded px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950"
                    onClick={() => run(() => deleteDraftEventAction(event.id))}
                  >
                    Delete draft
                  </button>
                ) : null}
                {access.canEdit && event.featuredImageUrl ? (
                  <button
                    type="button"
                    className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    onClick={() => run(() => removeEventImageAction(event.id))}
                  >
                    Remove image
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {access.canManageRegistration || access.canCheckIn ? (
        <div className="flex flex-wrap gap-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => setTab("overview")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === "overview"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "border border-zinc-300 dark:border-zinc-700"
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setTab("attendees")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === "attendees"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "border border-zinc-300 dark:border-zinc-700"
            }`}
          >
            Attendees
          </button>
          {access.canManageRegistration ? (
            <button
              type="button"
              onClick={() => setTab("settings")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                tab === "settings"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "border border-zinc-300 dark:border-zinc-700"
              }`}
            >
              Registration settings
            </button>
          ) : null}
          {access.canManageCheckIn ? (
            <button
              type="button"
              onClick={() => setTab("checkin")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                tab === "checkin"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "border border-zinc-300 dark:border-zinc-700"
              }`}
            >
              Check-in settings
            </button>
          ) : null}
        </div>
      ) : null}

      {tab === "attendees" && registration ? (
        <EventAttendeesPanel
          eventId={event.id}
          eventSlug={event.slug}
          registrations={registration.registrations}
          summary={registration.summary}
          access={{
            canManageRegistration: access.canManageRegistration,
            canCheckIn: access.canCheckIn,
            canExportRegistrations: access.canExportRegistrations,
          }}
        />
      ) : null}

      {tab === "settings" &&
      access.canManageRegistration &&
      registration?.settings ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Registration settings
          </h2>
          <RegistrationSettingsPanel settings={registration.settings} />
        </section>
      ) : null}

      {tab === "checkin" && access.canManageCheckIn && checkInSettings ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Check-in settings
          </h2>
          <CheckInSettingsPanel
            settings={checkInSettings}
            timezone={event.timezone}
          />
        </section>
      ) : null}

      {tab === "overview" ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="space-y-6">
            <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Overview
              </h2>
              {event.featuredImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={event.featuredImageUrl}
                  alt=""
                  className="mt-4 max-h-64 w-full rounded-md object-cover"
                />
              ) : (
                <div className="mt-4 flex h-40 items-center justify-center rounded-md border border-dashed border-zinc-300 text-sm text-zinc-500 dark:border-zinc-700">
                  No featured image
                </div>
              )}
              {event.shortDescription ? (
                <p className="mt-4 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  {event.shortDescription}
                </p>
              ) : null}
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                {event.description || "No description provided."}
              </p>
            </section>

            <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Schedule
              </h2>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-zinc-500">Starts</dt>
                  <dd className="text-zinc-900 dark:text-zinc-100">
                    {formatDateTime(event.startDateTime, event.isAllDay)}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Ends</dt>
                  <dd className="text-zinc-900 dark:text-zinc-100">
                    {formatDateTime(event.endDateTime, event.isAllDay)}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Timezone</dt>
                  <dd className="text-zinc-900 dark:text-zinc-100">{event.timezone}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">All day</dt>
                  <dd className="text-zinc-900 dark:text-zinc-100">
                    {event.isAllDay ? "Yes" : "No"}
                  </dd>
                </div>
                {event.recurrenceRule ? (
                  <div className="sm:col-span-2">
                    <dt className="text-zinc-500">Recurrence</dt>
                    <dd className="font-mono text-xs text-zinc-900 dark:text-zinc-100">
                      {event.recurrenceRule}
                      {event._count.occurrences > 0
                        ? ` · ${event._count.occurrences} generated occurrence(s)`
                        : ""}
                    </dd>
                  </div>
                ) : null}
                {event.parentEvent ? (
                  <div className="sm:col-span-2">
                    <dt className="text-zinc-500">Series parent</dt>
                    <dd>
                      <Link
                        href={`/events/${event.parentEvent.id}`}
                        className="text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100"
                      >
                        {event.parentEvent.title}
                      </Link>
                    </dd>
                  </div>
                ) : null}
              </dl>
            </section>

            <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Registration
              </h2>
              {registration?.summary ? (
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                  {registration.summary.confirmedCount} confirmed
                  {registration.summary.capacity != null
                    ? ` of ${registration.summary.capacity}`
                    : ""}
                  {registration.summary.waitlistCount > 0
                    ? ` · ${registration.summary.waitlistCount} waitlisted`
                    : ""}
                  {registration.settings?.isEnabled
                    ? " · Registration open"
                    : " · Registration disabled"}
                </p>
              ) : (
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                  Event-level registration summary.
                </p>
              )}
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-zinc-500">Required</dt>
                  <dd>{event.registrationRequired ? "Yes" : "No"}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Capacity</dt>
                  <dd>{event.registrationCapacity ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Waitlist</dt>
                  <dd>{event.waitlistEnabled ? "Enabled" : "Off"}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Fee</dt>
                  <dd>
                    {event.registrationFee != null
                      ? String(event.registrationFee)
                      : "—"}
                  </dd>
                </div>
              </dl>
              {event.registrationInstructions ? (
                <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
                  {event.registrationInstructions}
                </p>
              ) : null}
              {event.registrationRequired ? (
                <p className="mt-4">
                  <Link
                    href={`/register/${event.slug}`}
                    className="text-sm font-medium underline-offset-4 hover:underline"
                    target="_blank"
                  >
                    Open public registration page
                  </Link>
                </p>
              ) : null}
            </section>

            <section className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-6 dark:border-zinc-700 dark:bg-zinc-900/40">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Attendance
              </h2>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                Linked MemberAttendance records: {event._count.attendances}. Event
                check-in can create attendance when an attendee is linked to a
                member.
              </p>
            </section>

            <section className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-6 dark:border-zinc-700 dark:bg-zinc-900/40">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Volunteers
              </h2>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                Volunteer scheduling for this event will be added in a later patch.
              </p>
            </section>

            <section className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-6 dark:border-zinc-700 dark:bg-zinc-900/40">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Communications
              </h2>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                Event announcements and reminders will connect here later.
              </p>
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Location & contact
              </h2>
              <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">
                {event.location
                  ? `${event.location.name}${event.location.roomName ? ` · ${event.location.roomName}` : ""}${
                      event.location.isOnline ? " · Online" : ""
                    }`
                  : "No location set"}
              </p>
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
                {event.contactName || "—"}
                <br />
                {event.contactEmail || "—"}
                <br />
                {event.contactPhone || "—"}
              </p>
            </section>

            <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Organizers
              </h2>
              <ul className="mt-3 space-y-2 text-sm">
                {event.organizers.length === 0 ? (
                  <li className="text-zinc-500">No organizers assigned.</li>
                ) : (
                  event.organizers.map((org) => (
                    <li key={org.id}>
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {organizerLabel(org)}
                      </span>
                      <span className="text-zinc-500">
                        {" "}
                        · {formatEventEnumLabel(eventOrganizerRoleOptions, org.role)}
                        {org.isPrimary ? " · Primary" : ""}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </section>

            <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Ministries
              </h2>
              <ul className="mt-3 space-y-2 text-sm">
                {event.ministries.length === 0 ? (
                  <li className="text-zinc-500">No ministries linked.</li>
                ) : (
                  event.ministries.map((link) => (
                    <li key={link.id}>
                      <Link
                        href={`/ministries/${link.ministry.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {link.ministry.name}
                      </Link>
                      {link.isPrimary ? (
                        <span className="text-zinc-500"> · Primary</span>
                      ) : null}
                    </li>
                  ))
                )}
              </ul>
            </section>

            <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Activity
              </h2>
              <ul className="mt-3 space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
                {activity.length === 0 ? (
                  <li>No audit activity yet.</li>
                ) : (
                  activity.map((item) => (
                    <li key={item.id}>
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {item.action}
                      </span>{" "}
                      · {new Date(item.occurredAt).toLocaleString()}
                      {item.actor
                        ? ` · ${item.actor.displayName || item.actor.primaryEmail}`
                        : ""}
                    </li>
                  ))
                )}
              </ul>
              <p className="mt-4 text-xs text-zinc-500">
                Created by{" "}
                {event.createdBy?.displayName || event.createdBy?.primaryEmail || "—"}{" "}
                · Updated {new Date(event.updatedAt).toLocaleString()}
              </p>
            </section>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
