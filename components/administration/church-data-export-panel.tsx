"use client";

import { useState, useTransition } from "react";

import { exportChurchDataAction } from "@/app/(staff)/administration/data-export/actions";
import { formatMembershipStatus, membershipStatusValues } from "@/lib/constants/membership-status";
import {
  CHURCH_DATA_EXPORT_CONFIRMATION,
  type ChurchDataExportType,
} from "@/lib/validation/church-data-export";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";
const fieldClass =
  "mt-1 w-full rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 text-sm text-[var(--bits-navy)]";

type ExportCard = {
  exportType: ChurchDataExportType;
  title: string;
  description: string;
  includes: string;
  excludes: string;
};

const CARDS: ExportCard[] = [
  {
    exportType: "MEMBER_DIRECTORY",
    title: "Member Directory Export",
    description:
      "Download a CSV of active, non-archived member contact and membership fields.",
    includes:
      "Names, contact information, membership status, household name, and address fields.",
    excludes:
      "Confidential notes, emergency contacts, medical or pastoral notes, prayer requests, document paths, Clerk IDs, and passwords.",
  },
  {
    exportType: "OPERATIONS",
    title: "Church Operations Export",
    description:
      "Download one CSV covering equipment inventory, maintenance requests, purchase requests, and equipment check-out records.",
    includes:
      "Names, categories, statuses, condition or priority, quantities, storage or request locations, dates, and archive or return state.",
    excludes:
      "Internal notes, request descriptions, decision notes, user emails, record IDs, audit payloads, and purchase amounts.",
  },
  {
    exportType: "EVENT_LOCATIONS",
    title: "Event Location Export",
    description:
      "Download active and inactive event locations for campus, room, and public-address backup.",
    includes:
      "Location name, room name, on-site or online, capacity, active status, and public-style address fields.",
    excludes: "Online meeting URLs, location descriptions, and record IDs.",
  },
];

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function ChurchDataExportPanel() {
  const [isPending, startTransition] = useTransition();
  const [membershipStatus, setMembershipStatus] = useState("");
  const [pendingType, setPendingType] = useState<ChurchDataExportType | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function runExport(nextType: ChurchDataExportType) {
    if (!window.confirm(CHURCH_DATA_EXPORT_CONFIRMATION)) return;

    startTransition(async () => {
      setPendingType(nextType);
      setMessage(null);
      setError(null);
      const result = await exportChurchDataAction({
        exportType: nextType,
        confirmed: true,
        membershipStatus:
          nextType === "MEMBER_DIRECTORY" ? membershipStatus : undefined,
      });
      setPendingType(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      downloadCsv(result.csv, result.filename);
      setMessage(result.message);
    });
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          {error}
        </p>
      ) : null}
      {message ? (
        <p
          role="status"
          className="rounded-xl border border-[var(--bits-gold)] bg-white px-4 py-3 text-sm text-[var(--bits-navy)]"
        >
          {message}
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        {CARDS.map((card) => (
          <article
            key={card.exportType}
            className="flex flex-col rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm"
          >
            <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
              {card.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--bits-muted)]">
              {card.description}
            </p>
            <p className="mt-3 text-sm leading-6 text-[var(--bits-navy)]">
              <span className="font-semibold">Includes: </span>
              {card.includes}
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--bits-navy)]">
              <span className="font-semibold">Excludes: </span>
              {card.excludes}
            </p>
            {card.exportType === "MEMBER_DIRECTORY" ? (
              <label className="mt-4 text-sm font-medium text-[var(--bits-navy)]">
                Membership status
                <select
                  value={membershipStatus}
                  onChange={(event) => setMembershipStatus(event.target.value)}
                  className={fieldClass}
                >
                  <option value="">All active members</option>
                  {membershipStatusValues.map((status) => (
                    <option key={status} value={status}>
                      {formatMembershipStatus(status)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {card.exportType === "MEMBER_DIRECTORY" ? (
              <p className="mt-3 text-sm leading-6 text-[var(--bits-muted)]">
                This file contains private membership and contact information.
                Save it only to an approved, secure location.
              </p>
            ) : null}
            <div className="mt-auto pt-5">
              <button
                type="button"
                onClick={() => runExport(card.exportType)}
                disabled={isPending}
                className={`w-full rounded-xl bg-[var(--bits-navy)] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 ${focusClass}`}
              >
                {isPending && pendingType === card.exportType
                  ? "Exporting..."
                  : "Export CSV"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
