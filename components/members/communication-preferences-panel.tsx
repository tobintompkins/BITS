"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { updateCommunicationPreferencesAction } from "@/app/(staff)/member-lifecycle/actions";
import type { MemberLifecycleAccess } from "@/lib/auth/member-lifecycle-permissions";
import {
  consentChangeSourceOptions,
  formatLifecycleEnumLabel,
  memberConsentTypeOptions,
  preferredContactMethodOptions,
} from "@/lib/constants/member-lifecycle";

type Preferences = {
  preferredContactMethod: string | null;
  allowEmail: boolean;
  allowSms: boolean;
  allowPhoneCalls: boolean;
  allowPostalMail: boolean;
  allowDirectoryListing: boolean;
  allowPhotoUse: boolean;
};

type ConsentEntry = {
  id: string;
  consentType: string;
  previousValue: string | null;
  newValue: string;
  source: string;
  notes: string | null;
  changedAt: Date;
  changedBy: {
    displayName: string | null;
    primaryEmail: string;
  } | null;
};

export function CommunicationPreferencesPanel({
  memberId,
  preferences,
  consentHistory,
  access,
}: {
  memberId: string;
  preferences: Preferences;
  consentHistory: ConsentEntry[];
  access: MemberLifecycleAccess;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Communication Preferences
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          Control how this member may be contacted and whether they appear in
          the directory.
        </p>

        {access.canManagePreferences ? (
          <form
            className="mt-4 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const fd = new FormData(event.currentTarget);
              fd.set("memberId", memberId);
              setError(null);
              startTransition(async () => {
                try {
                  const result = await updateCommunicationPreferencesAction(fd);
                  if (result.status === "error") {
                    setError(result.message);
                    return;
                  }
                  setMessage(result.message);
                  router.refresh();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Save failed.");
                }
              });
            }}
          >
            <label className="block space-y-1 text-sm">
              <span>Preferred contact method</span>
              <select
                name="preferredContactMethod"
                defaultValue={preferences.preferredContactMethod ?? ""}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">No selection</option>
                {preferredContactMethodOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["allowEmail", "Allow email", preferences.allowEmail],
                  ["allowSms", "Allow SMS", preferences.allowSms],
                  ["allowPhoneCalls", "Allow phone calls", preferences.allowPhoneCalls],
                  ["allowPostalMail", "Allow postal mail", preferences.allowPostalMail],
                  [
                    "allowDirectoryListing",
                    "Allow directory listing",
                    preferences.allowDirectoryListing,
                  ],
                  ["allowPhotoUse", "Allow photo use", preferences.allowPhotoUse],
                ] as const
              ).map(([name, label, checked]) => (
                <label key={name} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name={name}
                    defaultChecked={checked}
                    value="true"
                  />
                  {label}
                </label>
              ))}
            </div>

            <label className="block space-y-1 text-sm">
              <span>Change source</span>
              <select
                name="source"
                defaultValue="STAFF_UPDATE"
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              >
                {consentChangeSourceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1 text-sm">
              <span>Notes</span>
              <textarea
                name="notes"
                rows={2}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>

            {message ? (
              <p className="text-sm text-emerald-700 dark:text-emerald-300">
                {message}
              </p>
            ) : null}
            {error ? (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            ) : null}

            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              {isPending ? "Saving..." : "Save Preferences"}
            </button>
          </form>
        ) : (
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase text-zinc-500">Preferred method</dt>
              <dd className="text-sm">
                {formatLifecycleEnumLabel(
                  preferredContactMethodOptions,
                  preferences.preferredContactMethod,
                )}
              </dd>
            </div>
            {(
              [
                ["Email", preferences.allowEmail],
                ["SMS", preferences.allowSms],
                ["Phone", preferences.allowPhoneCalls],
                ["Postal", preferences.allowPostalMail],
                ["Directory", preferences.allowDirectoryListing],
                ["Photo", preferences.allowPhotoUse],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs uppercase text-zinc-500">{label}</dt>
                <dd className="text-sm">{value ? "Allowed" : "Opted out"}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {access.canViewConsentHistory ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Consent History
          </h2>
          {consentHistory.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No consent changes recorded.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                    <th className="px-2 py-2">When</th>
                    <th className="px-2 py-2">Type</th>
                    <th className="px-2 py-2">Change</th>
                    <th className="px-2 py-2">Source</th>
                    <th className="px-2 py-2">By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {consentHistory.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {entry.changedAt.toLocaleString()}
                      </td>
                      <td className="px-2 py-2">
                        {formatLifecycleEnumLabel(
                          memberConsentTypeOptions,
                          entry.consentType,
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {entry.previousValue ?? "—"} → {entry.newValue}
                      </td>
                      <td className="px-2 py-2">
                        {formatLifecycleEnumLabel(
                          consentChangeSourceOptions,
                          entry.source,
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {entry.changedBy?.displayName ??
                          entry.changedBy?.primaryEmail ??
                          "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
