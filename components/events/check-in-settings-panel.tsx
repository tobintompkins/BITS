"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { updateCheckInSettingsAction } from "@/app/(staff)/events/check-in-actions";

type Settings = {
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
};

type FieldErrors = Partial<Record<string, string[] | undefined>>;

function toLocalInput(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">
      {message}
    </p>
  );
}

function fieldClass(hasError: boolean) {
  return [
    "mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm disabled:opacity-50 dark:bg-zinc-950",
    hasError
      ? "border-red-500 dark:border-red-400"
      : "border-zinc-300 dark:border-zinc-700",
  ].join(" ");
}

function firstError(fieldErrors: FieldErrors, field: string) {
  return fieldErrors[field]?.[0];
}

export function CheckInSettingsPanel({
  settings,
  timezone,
}: {
  settings: Settings;
  timezone?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [enabled, setEnabled] = useState(settings.checkInEnabled);
  const [allowCheckOut, setAllowCheckOut] = useState(settings.allowCheckOut);
  const [requireRegistration, setRequireRegistration] = useState(
    settings.requireRegistration,
  );

  const opensError = firstError(fieldErrors, "checkInOpensAt");
  const closesError = firstError(fieldErrors, "checkInClosesAt");
  const enabledError = firstError(fieldErrors, "checkInEnabled");
  const selfError = firstError(fieldErrors, "allowSelfCheckIn");
  const walkInError = firstError(fieldErrors, "allowWalkIns");
  const checkOutError = firstError(fieldErrors, "allowCheckOut");
  const reentryError = firstError(fieldErrors, "allowReentry");
  const requireRegError = firstError(fieldErrors, "requireRegistration");

  return (
    <form
      className={`space-y-4 ${isPending ? "opacity-70" : ""}`}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        formData.set("checkInEnabled", enabled ? "true" : "false");
        formData.set("allowCheckOut", allowCheckOut ? "true" : "false");
        formData.set(
          "requireRegistration",
          requireRegistration ? "true" : "false",
        );
        startTransition(async () => {
          const result = await updateCheckInSettingsAction(formData);
          setMessage(result.message);
          if (result.status === "error" && "fieldErrors" in result) {
            setFieldErrors(result.fieldErrors ?? {});
          } else {
            setFieldErrors({});
          }
          if (result.status === "success") router.refresh();
        });
      }}
    >
      <input type="hidden" name="eventId" value={settings.eventId} />
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        Configure check-in policy and windows for this event. Settings are
        tenant-scoped and only affect operational check-in after check-in is
        enabled. Default for existing events is disabled.
      </p>
      <p className="text-xs text-zinc-500">
        Event timezone: {timezone ?? "organization default"}.
      </p>
      {message ? (
        <p
          role="status"
          aria-live="polite"
          className={`rounded-md border px-3 py-2 text-sm ${
            Object.keys(fieldErrors).length > 0
              ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
              : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
          }`}
        >
          {message}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="checkInEnabled"
              value="true"
              checked={enabled}
              aria-invalid={enabledError ? true : undefined}
              aria-describedby={enabledError ? "err-checkInEnabled" : undefined}
              onChange={(e) => {
                setEnabled(e.target.checked);
                if (!e.target.checked) setAllowCheckOut(false);
              }}
            />
            Check-in enabled
          </label>
          <FieldError id="err-checkInEnabled" message={enabledError} />
        </div>
        <label className="block text-sm">
          <span className="font-medium">Opens at</span>
          <input
            type="datetime-local"
            name="checkInOpensAt"
            defaultValue={toLocalInput(settings.checkInOpensAt)}
            className={fieldClass(Boolean(opensError))}
            aria-invalid={opensError ? true : undefined}
            aria-describedby={
              opensError ? "err-checkInOpensAt checkin-window-help" : "checkin-window-help"
            }
          />
          <FieldError id="err-checkInOpensAt" message={opensError} />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Closes at</span>
          <input
            type="datetime-local"
            name="checkInClosesAt"
            defaultValue={toLocalInput(settings.checkInClosesAt)}
            className={fieldClass(Boolean(closesError))}
            aria-invalid={closesError ? true : undefined}
            aria-describedby={
              closesError
                ? "err-checkInClosesAt checkin-window-help"
                : "checkin-window-help"
            }
          />
          <FieldError id="err-checkInClosesAt" message={closesError} />
        </label>
      </div>
      <p id="checkin-window-help" className="text-xs text-zinc-500">
        Close time must be later than open time when both are set.
      </p>

      <fieldset className="grid gap-2 sm:grid-cols-2" disabled={!enabled}>
        <legend className="mb-1 text-sm font-medium">Options</legend>
        <div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="allowSelfCheckIn"
              value="true"
              defaultChecked={settings.allowSelfCheckIn}
              disabled={!enabled}
              aria-invalid={selfError ? true : undefined}
              aria-describedby={selfError ? "err-allowSelfCheckIn" : undefined}
            />
            Allow self check-in
          </label>
          <FieldError id="err-allowSelfCheckIn" message={selfError} />
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="allowCheckOut"
              value="true"
              checked={allowCheckOut}
              disabled={!enabled}
              aria-invalid={checkOutError ? true : undefined}
              aria-describedby={checkOutError ? "err-allowCheckOut" : undefined}
              onChange={(e) => setAllowCheckOut(e.target.checked)}
            />
            Allow check-out
          </label>
          <FieldError id="err-allowCheckOut" message={checkOutError} />
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="allowReentry"
              value="true"
              defaultChecked={settings.allowReentry}
              disabled={!enabled || !allowCheckOut}
              aria-invalid={reentryError ? true : undefined}
              aria-describedby={reentryError ? "err-allowReentry" : undefined}
            />
            Allow re-entry
          </label>
          <FieldError id="err-allowReentry" message={reentryError} />
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="requireRegistration"
              value="true"
              checked={requireRegistration}
              disabled={!enabled}
              aria-invalid={requireRegError ? true : undefined}
              aria-describedby={
                requireRegError ? "err-requireRegistration" : undefined
              }
              onChange={(e) => setRequireRegistration(e.target.checked)}
            />
            Require prior registration
          </label>
          <FieldError id="err-requireRegistration" message={requireRegError} />
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="allowWalkIns"
              value="true"
              defaultChecked={settings.allowWalkIns}
              disabled={!enabled || requireRegistration}
              aria-invalid={walkInError ? true : undefined}
              aria-describedby={walkInError ? "err-allowWalkIns" : undefined}
            />
            Allow walk-ins
          </label>
          <FieldError id="err-allowWalkIns" message={walkInError} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="qrPassEnabled"
            value="true"
            defaultChecked={settings.qrPassEnabled}
            disabled={!enabled}
          />
          QR passes enabled
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="stationNameRequired"
            value="true"
            defaultChecked={settings.stationNameRequired}
            disabled={!enabled}
          />
          Require active station
        </label>
      </fieldset>
      <p className="text-xs text-zinc-500">
        Re-entry requires check-out. Walk-ins require registration not required.
        Dependent options stay disabled while check-in is off; the server also
        rejects invalid combinations.
      </p>

      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        {isPending ? "Saving…" : "Save check-in settings"}
      </button>
    </form>
  );
}
