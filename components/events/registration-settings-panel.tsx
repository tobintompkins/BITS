"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { updateRegistrationSettingsAction } from "@/app/(staff)/events/registration-actions";
import {
  eventRegistrationVisibilityOptions,
  waitlistPromotionModeOptions,
} from "@/lib/constants/event-registration";

type Settings = {
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
};

function toLocalInput(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950";

export function RegistrationSettingsPanel({ settings }: { settings: Settings }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <form
      className={`space-y-4 ${isPending ? "opacity-70" : ""}`}
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await updateRegistrationSettingsAction(formData);
          setMessage(result.message);
          if (result.status === "success") router.refresh();
        });
      }}
    >
      <input type="hidden" name="eventId" value={settings.eventId} />
      {message ? (
        <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          {message}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isEnabled"
            value="true"
            defaultChecked={settings.isEnabled}
          />
          Registration enabled
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="waitlistEnabled"
            value="true"
            defaultChecked={settings.waitlistEnabled}
          />
          Waitlist enabled
        </label>
        <label className="block text-sm">
          <span className="font-medium">Visibility</span>
          <select
            name="visibility"
            defaultValue={settings.visibility}
            className={inputClass}
          >
            {eventRegistrationVisibilityOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Promotion mode</span>
          <select
            name="promotionMode"
            defaultValue={settings.promotionMode}
            className={inputClass}
          >
            {waitlistPromotionModeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Opens at</span>
          <input
            type="datetime-local"
            name="opensAt"
            defaultValue={toLocalInput(settings.opensAt)}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Closes at</span>
          <input
            type="datetime-local"
            name="closesAt"
            defaultValue={toLocalInput(settings.closesAt)}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Capacity</span>
          <input
            type="number"
            min={1}
            name="capacity"
            defaultValue={settings.capacity ?? ""}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Waitlist capacity</span>
          <input
            type="number"
            min={1}
            name="waitlistCapacity"
            defaultValue={settings.waitlistCapacity ?? ""}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Max attendees / registration</span>
          <input
            type="number"
            min={1}
            max={50}
            name="maxAttendeesPerRegistration"
            defaultValue={settings.maxAttendeesPerRegistration}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Promotion offer TTL (minutes)</span>
          <input
            type="number"
            min={15}
            max={10080}
            name="promotionOfferTtlMinutes"
            defaultValue={settings.promotionOfferTtlMinutes ?? 1440}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Cancellation deadline</span>
          <input
            type="datetime-local"
            name="cancellationDeadline"
            defaultValue={toLocalInput(settings.cancellationDeadline)}
            className={inputClass}
          />
        </label>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {(
          [
            ["allowHouseholdRegistration", "Allow household", settings.allowHouseholdRegistration],
            ["allowGuestRegistration", "Allow guests", settings.allowGuestRegistration],
            ["requireAuthentication", "Require sign-in", settings.requireAuthentication],
            ["requireEmail", "Require email", settings.requireEmail],
            ["requirePhone", "Require phone", settings.requirePhone],
            ["requireDateOfBirth", "Require date of birth", settings.requireDateOfBirth],
            ["requireEmergencyContact", "Require emergency contact", settings.requireEmergencyContact],
            ["requireGuardianForMinors", "Require guardian for minors", settings.requireGuardianForMinors],
            ["allowCancellation", "Allow cancellation", settings.allowCancellation],
            ["confirmationRequired", "Confirmation required (pending)", settings.confirmationRequired],
            ["checkInEnabled", "Check-in enabled", settings.checkInEnabled],
            ["qrCheckInEnabled", "QR check-in enabled", settings.qrCheckInEnabled],
            ["showCapacityPublicly", "Show capacity publicly", settings.showCapacityPublicly],
            ["showWaitlistPublicly", "Show waitlist publicly", settings.showWaitlistPublicly],
          ] as const
        ).map(([name, label, checked]) => (
          <label key={name} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name={name}
              value="true"
              defaultChecked={checked}
            />
            {label}
          </label>
        ))}
      </div>

      <label className="block text-sm">
        <span className="font-medium">Instructions</span>
        <textarea
          name="instructions"
          rows={2}
          defaultValue={settings.instructions ?? ""}
          className={inputClass}
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Confirmation message</span>
        <textarea
          name="confirmationMessage"
          rows={2}
          defaultValue={settings.confirmationMessage ?? ""}
          className={inputClass}
        />
      </label>

      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        {isPending ? "Saving…" : "Save registration settings"}
      </button>
    </form>
  );
}
