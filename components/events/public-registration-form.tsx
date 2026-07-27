"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { submitPublicRegistrationAction } from "@/app/register/actions";

type Props = {
  eventId: string;
  slug: string;
  settings: {
    requireEmail: boolean;
    requirePhone: boolean;
    requireDateOfBirth: boolean;
    requireEmergencyContact: boolean;
    requireGuardianForMinors: boolean;
    allowGuestRegistration: boolean;
    maxAttendeesPerRegistration: number;
  };
};

const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950";

export function PublicRegistrationForm({ eventId, slug, settings }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isMinor, setIsMinor] = useState(false);

  return (
    <form
      className={`space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${
        isPending ? "opacity-70" : ""
      }`}
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        formData.set("eventId", eventId);
        formData.set("slug", slug);
        startTransition(async () => {
          const result = await submitPublicRegistrationAction(formData);
          setMessage(result.message);
          if (result.status === "success" && result.confirmationCode) {
            router.push(`/register/confirmation/${result.confirmationCode}`);
          }
        });
      }}
    >
      <input type="hidden" name="eventId" value={eventId} />
      {message ? (
        <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          {message}
        </p>
      ) : null}

      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
        Register
      </h2>

      <label className="block text-sm">
        <span className="font-medium">Contact name</span>
        <input name="primaryContactName" required className={inputClass} />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Contact email</span>
        <input
          name="primaryContactEmail"
          type="email"
          required={settings.requireEmail}
          className={inputClass}
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Contact phone</span>
        <input
          name="primaryContactPhone"
          required={settings.requirePhone}
          className={inputClass}
        />
      </label>

      <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Primary attendee
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium">First name</span>
            <input name="firstName" required className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Last name</span>
            <input name="lastName" required className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Email</span>
            <input name="email" type="email" className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Phone</span>
            <input name="phone" className={inputClass} />
          </label>
          {settings.requireDateOfBirth ? (
            <label className="block text-sm">
              <span className="font-medium">Date of birth</span>
              <input name="dateOfBirth" type="date" required className={inputClass} />
            </label>
          ) : null}
          {settings.allowGuestRegistration ? (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="isGuest" value="true" /> I am a guest
            </label>
          ) : null}
          {settings.requireGuardianForMinors ? (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                name="isMinor"
                value="true"
                checked={isMinor}
                onChange={(e) => setIsMinor(e.target.checked)}
              />
              Attendee is a minor
            </label>
          ) : null}
          {isMinor ? (
            <>
              <label className="block text-sm">
                <span className="font-medium">Guardian name</span>
                <input name="guardianName" required className={inputClass} />
              </label>
              <label className="block text-sm">
                <span className="font-medium">Guardian phone</span>
                <input name="guardianPhone" required className={inputClass} />
              </label>
            </>
          ) : null}
          {settings.requireEmergencyContact ? (
            <>
              <label className="block text-sm">
                <span className="font-medium">Emergency contact name</span>
                <input
                  name="emergencyContactName"
                  required
                  className={inputClass}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium">Emergency contact phone</span>
                <input
                  name="emergencyContactPhone"
                  required
                  className={inputClass}
                />
              </label>
            </>
          ) : null}
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium">Accessibility / accommodation request</span>
            <textarea name="accommodationRequest" rows={2} className={inputClass} />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium">Dietary notes</span>
            <textarea name="dietaryNotes" rows={2} className={inputClass} />
          </label>
        </div>
      </div>

      <label className="block text-sm">
        <span className="font-medium">Notes</span>
        <textarea name="notes" rows={2} className={inputClass} />
      </label>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        {isPending ? "Submitting…" : "Submit registration"}
      </button>
      {settings.maxAttendeesPerRegistration > 1 ? (
        <p className="text-xs text-zinc-500">
          Party size up to {settings.maxAttendeesPerRegistration} is supported;
          additional attendees can be added by staff or a future multi-attendee
          form.
        </p>
      ) : null}
    </form>
  );
}
