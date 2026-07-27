"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  createEventAction,
  previewRecurrenceAction,
  updateEventAction,
  uploadEventImageAction,
} from "@/app/(staff)/events/actions";
import {
  eventOrganizerRoleOptions,
  eventVisibilityOptions,
  recurrencePresetOptions,
} from "@/lib/constants/events";

const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const sectionClass =
  "space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900";

type Option = { id: string; name: string };
type StaffOption = { id: string; displayName: string | null; primaryEmail: string };
type MemberOption = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
};

type OrganizerDraft = {
  userId: string;
  memberId: string;
  organizerName: string;
  organizerEmail: string;
  role: string;
  isPrimary: boolean;
};

export type EventFormValues = {
  title: string;
  slug: string;
  shortDescription: string;
  description: string;
  categoryId: string;
  locationId: string;
  visibility: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  timezone: string;
  isAllDay: boolean;
  registrationRequired: boolean;
  registrationOpenDate: string;
  registrationCloseDate: string;
  registrationCapacity: string;
  waitlistEnabled: boolean;
  registrationFee: string;
  registrationInstructions: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  isRecurring: boolean;
  recurrencePreset: string;
  recurrenceByDay: string;
  recurrenceInterval: string;
  recurrenceEndDate: string;
  recurrenceCustomRule: string;
  ministryIds: string[];
  primaryMinistryId: string;
  organizers: OrganizerDraft[];
  featuredImageUrl?: string | null;
  isRecurringSeries?: boolean;
  parentEventId?: string | null;
};

export function EventForm({
  mode,
  eventId,
  initialValues,
  categories,
  locations,
  ministries,
  staffUsers,
  members,
  canPublish,
}: {
  mode: "create" | "edit";
  eventId?: string;
  initialValues: EventFormValues;
  categories: Option[];
  locations: Option[];
  ministries: Option[];
  staffUsers: StaffOption[];
  members: MemberOption[];
  canPublish: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Array<{ start: string; end: string }>>(
    [],
  );
  const [organizers, setOrganizers] = useState<OrganizerDraft[]>(
    initialValues.organizers.length > 0
      ? initialValues.organizers
      : [
          {
            userId: "",
            memberId: "",
            organizerName: "",
            organizerEmail: "",
            role: "PRIMARY_CONTACT",
            isPrimary: true,
          },
        ],
  );
  const [ministryIds, setMinistryIds] = useState(initialValues.ministryIds);
  const [isRecurring, setIsRecurring] = useState(initialValues.isRecurring);
  const [isAllDay, setIsAllDay] = useState(initialValues.isAllDay);
  const [scope, setScope] = useState("ENTIRE_SERIES");

  const showScopePrompt =
    mode === "edit" &&
    (initialValues.isRecurringSeries || Boolean(initialValues.parentEventId));

  const ministryOptions = useMemo(() => ministries, [ministries]);

  function submit(formData: FormData, publishNow: boolean) {
    setError(null);
    formData.set("publishNow", publishNow ? "true" : "false");
    formData.set("isRecurring", isRecurring ? "true" : "false");
    formData.set("isAllDay", isAllDay ? "true" : "false");
    formData.set("organizersJson", JSON.stringify(organizers));
    formData.set("ministryIdsJson", JSON.stringify(ministryIds));
    if (showScopePrompt) {
      formData.set("recurrenceEditScope", scope);
    }

    startTransition(async () => {
      const result =
        mode === "create"
          ? await createEventAction(formData)
          : await updateEventAction(eventId!, formData);

      if (result.status === "error") {
        setError(result.message);
        return;
      }

      const image = formData.get("featuredImage");
      const createdId =
        mode === "create" && result.status === "success" && "id" in result
          ? (result.id as string | undefined)
          : undefined;
      const id = createdId ?? eventId;
      if (id && image instanceof File && image.size > 0) {
        const imageData = new FormData();
        imageData.set("featuredImage", image);
        await uploadEventImageAction(id, imageData);
      }

      if (id) {
        router.push(`/events/${id}`);
      } else {
        router.push("/events");
      }
      router.refresh();
    });
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        submit(formData, false);
      }}
    >
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {showScopePrompt ? (
        <div className={sectionClass}>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Recurring edit scope
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Choose how this edit applies. THIS_AND_FUTURE on a single occurrence
            updates that occurrence only in Patch 7.1.
          </p>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className={inputClass}
          >
            <option value="THIS_OCCURRENCE">This occurrence only</option>
            <option value="THIS_AND_FUTURE">This and future occurrences</option>
            <option value="ENTIRE_SERIES">Entire series</option>
          </select>
        </div>
      ) : null}

      <section className={sectionClass}>
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Basic information
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Title</span>
            <input name="title" required defaultValue={initialValues.title} className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Slug (optional)</span>
            <input name="slug" defaultValue={initialValues.slug} className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Visibility</span>
            <select name="visibility" defaultValue={initialValues.visibility} className={inputClass}>
              {eventVisibilityOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Category</span>
            <select name="categoryId" defaultValue={initialValues.categoryId} className={inputClass}>
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Featured image</span>
            <input name="featuredImage" type="file" accept="image/jpeg,image/png,image/webp" className={inputClass} />
            {initialValues.featuredImageUrl ? (
              <p className="mt-1 text-xs text-zinc-500">Current image on file.</p>
            ) : null}
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Short description</span>
            <input
              name="shortDescription"
              defaultValue={initialValues.shortDescription}
              maxLength={300}
              className={inputClass}
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Description</span>
            <textarea
              name="description"
              rows={4}
              defaultValue={initialValues.description}
              className={inputClass}
            />
          </label>
        </div>
      </section>

      <section className={sectionClass}>
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Schedule</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Start date</span>
            <input name="startDate" type="date" required defaultValue={initialValues.startDate} className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Start time</span>
            <input
              name="startTime"
              type="time"
              defaultValue={initialValues.startTime}
              disabled={isAllDay}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">End date</span>
            <input name="endDate" type="date" required defaultValue={initialValues.endDate} className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">End time</span>
            <input
              name="endTime"
              type="time"
              defaultValue={initialValues.endTime}
              disabled={isAllDay}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Timezone</span>
            <input name="timezone" required defaultValue={initialValues.timezone} className={inputClass} />
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 sm:mt-6">
            <input
              type="checkbox"
              checked={isAllDay}
              onChange={(e) => setIsAllDay(e.target.checked)}
            />
            All-day event
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={isRecurring}
              onChange={(e) => setIsRecurring(e.target.checked)}
            />
            Recurring event
          </label>
        </div>

        {isRecurring ? (
          <div className="mt-4 grid gap-4 border-t border-zinc-200 pt-4 dark:border-zinc-800 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Recurrence</span>
              <select
                name="recurrencePreset"
                defaultValue={initialValues.recurrencePreset}
                className={inputClass}
              >
                {recurrencePresetOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Interval</span>
              <input
                name="recurrenceInterval"
                type="number"
                min={1}
                defaultValue={initialValues.recurrenceInterval || "1"}
                className={inputClass}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">By day (e.g. SU,WE)</span>
              <input
                name="recurrenceByDay"
                defaultValue={initialValues.recurrenceByDay}
                className={inputClass}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Ends on</span>
              <input
                name="recurrenceEndDate"
                type="date"
                defaultValue={initialValues.recurrenceEndDate}
                className={inputClass}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Custom RRULE</span>
              <input
                name="recurrenceCustomRule"
                defaultValue={initialValues.recurrenceCustomRule}
                className={inputClass}
              />
            </label>
            <div className="sm:col-span-2">
              <button
                type="button"
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
                onClick={() => {
                  const form = document.querySelector("form");
                  if (!form) return;
                  const formData = new FormData(form);
                  formData.set("isAllDay", isAllDay ? "true" : "false");
                  startTransition(async () => {
                    const result = await previewRecurrenceAction(formData);
                    if (result.status === "error") {
                      setError(result.message);
                      return;
                    }
                    setPreview(result.occurrences ?? []);
                  });
                }}
              >
                Preview occurrences
              </button>
              {preview.length > 0 ? (
                <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-xs text-zinc-600 dark:text-zinc-300">
                  {preview.map((item) => (
                    <li key={item.start}>
                      {new Date(item.start).toLocaleString()} →{" "}
                      {new Date(item.end).toLocaleString()}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <input type="hidden" name="recurrencePreset" value="NONE" />
          </>
        )}
      </section>

      <section className={sectionClass}>
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Location</h2>
        <label className="block text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Location</span>
          <select name="locationId" defaultValue={initialValues.locationId} className={inputClass}>
            <option value="">None</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className={sectionClass}>
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Registration
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              name="registrationRequired"
              value="true"
              defaultChecked={initialValues.registrationRequired}
            />
            Registration required
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              name="waitlistEnabled"
              value="true"
              defaultChecked={initialValues.waitlistEnabled}
            />
            Waitlist enabled
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Open date</span>
            <input
              name="registrationOpenDate"
              type="datetime-local"
              defaultValue={initialValues.registrationOpenDate}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Close date</span>
            <input
              name="registrationCloseDate"
              type="datetime-local"
              defaultValue={initialValues.registrationCloseDate}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Capacity</span>
            <input
              name="registrationCapacity"
              type="number"
              min={1}
              defaultValue={initialValues.registrationCapacity}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Fee</span>
            <input
              name="registrationFee"
              type="number"
              min={0}
              step="0.01"
              defaultValue={initialValues.registrationFee}
              className={inputClass}
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Instructions</span>
            <textarea
              name="registrationInstructions"
              rows={2}
              defaultValue={initialValues.registrationInstructions}
              className={inputClass}
            />
          </label>
        </div>
      </section>

      <section className={sectionClass}>
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Contact</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Name</span>
            <input name="contactName" defaultValue={initialValues.contactName} className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Email</span>
            <input name="contactEmail" type="email" defaultValue={initialValues.contactEmail} className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Phone</span>
            <input name="contactPhone" defaultValue={initialValues.contactPhone} className={inputClass} />
          </label>
        </div>
      </section>

      <section className={sectionClass}>
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Organizers & ministries
        </h2>
        <div className="space-y-3">
          {organizers.map((org, index) => (
            <div
              key={index}
              className="grid gap-3 rounded-md border border-zinc-200 p-3 dark:border-zinc-800 sm:grid-cols-2"
            >
              <label className="block text-sm">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">Staff user</span>
                <select
                  value={org.userId}
                  onChange={(e) => {
                    const next = [...organizers];
                    next[index] = { ...next[index], userId: e.target.value };
                    setOrganizers(next);
                  }}
                  className={inputClass}
                >
                  <option value="">None</option>
                  {staffUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName || u.primaryEmail}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">Member</span>
                <select
                  value={org.memberId}
                  onChange={(e) => {
                    const next = [...organizers];
                    next[index] = { ...next[index], memberId: e.target.value };
                    setOrganizers(next);
                  }}
                  className={inputClass}
                >
                  <option value="">None</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.preferredName || m.firstName} {m.lastName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">Name</span>
                <input
                  value={org.organizerName}
                  onChange={(e) => {
                    const next = [...organizers];
                    next[index] = { ...next[index], organizerName: e.target.value };
                    setOrganizers(next);
                  }}
                  className={inputClass}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">Role</span>
                <select
                  value={org.role}
                  onChange={(e) => {
                    const next = [...organizers];
                    next[index] = { ...next[index], role: e.target.value };
                    setOrganizers(next);
                  }}
                  className={inputClass}
                >
                  {eventOrganizerRoleOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={org.isPrimary}
                  onChange={(e) => {
                    const next = organizers.map((item, i) => ({
                      ...item,
                      isPrimary: i === index ? e.target.checked : false,
                    }));
                    setOrganizers(next);
                  }}
                />
                Primary
              </label>
            </div>
          ))}
          <button
            type="button"
            className="text-sm font-medium underline-offset-4 hover:underline"
            onClick={() =>
              setOrganizers([
                ...organizers,
                {
                  userId: "",
                  memberId: "",
                  organizerName: "",
                  organizerEmail: "",
                  role: "OTHER",
                  isPrimary: false,
                },
              ])
            }
          >
            Add organizer
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <fieldset>
            <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Ministries
            </legend>
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
              {ministryOptions.map((m) => (
                <label
                  key={m.id}
                  className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300"
                >
                  <input
                    type="checkbox"
                    checked={ministryIds.includes(m.id)}
                    onChange={(e) => {
                      setMinistryIds((prev) =>
                        e.target.checked
                          ? [...prev, m.id]
                          : prev.filter((id) => id !== m.id),
                      );
                    }}
                  />
                  {m.name}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              Primary ministry
            </span>
            <select
              name="primaryMinistryId"
              defaultValue={initialValues.primaryMinistryId}
              className={inputClass}
            >
              <option value="">None</option>
              {ministryIds.map((id) => {
                const m = ministryOptions.find((x) => x.id === id);
                return (
                  <option key={id} value={id}>
                    {m?.name ?? id}
                  </option>
                );
              })}
            </select>
          </label>
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium disabled:opacity-60 dark:border-zinc-700"
        >
          Save Draft
        </button>
        {canPublish ? (
          <button
            type="button"
            disabled={isPending}
            onClick={(e) => {
              const form = (e.currentTarget as HTMLButtonElement).form;
              if (!form) return;
              submit(new FormData(form), true);
            }}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {mode === "create" ? "Publish Event" : "Save & Publish"}
          </button>
        ) : null}
        <Link
          href={eventId ? `/events/${eventId}` : "/events"}
          className="rounded-md px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-300"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
