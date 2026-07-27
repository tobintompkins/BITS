"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { executeMergeAction } from "@/app/(staff)/member-lifecycle/actions";
import { getMemberDisplayName } from "@/lib/utils/member-display";

type MemberLite = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  email: string | null;
  phone: string | null;
  recordStatus: string;
  [key: string]: unknown;
};

type FieldComparison = {
  field: string;
  primaryValue: string;
  duplicateValue: string;
  recommended: "primary";
};

type PrepareResult = {
  primary: MemberLite;
  duplicate: MemberLite;
  primaryCounts: Record<string, number>;
  duplicateCounts: Record<string, number>;
  recommendedPrimaryId: string;
  recommendationReasons: string[];
  fieldComparisons: FieldComparison[];
  requiresArchivedConfirmation: boolean;
};

const STEPS = [
  "Select Records",
  "Choose Primary",
  "Compare Fields",
  "Choose Values",
  "Related Records",
  "Confirm Merge",
  "Results",
] as const;

function formatFieldLabel(field: string) {
  return field
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase());
}

export function MemberMergeWizard({
  initialPrepare,
  memberOptions,
}: {
  initialPrepare: PrepareResult | null;
  memberOptions: Array<{
    id: string;
    firstName: string;
    lastName: string;
    preferredName: string | null;
  }>;
}) {
  const router = useRouter();
  const [step, setStep] = useState(initialPrepare ? 1 : 0);
  const [primaryId, setPrimaryId] = useState(
    initialPrepare?.recommendedPrimaryId ?? initialPrepare?.primary.id ?? "",
  );
  const [duplicateId, setDuplicateId] = useState(() => {
    if (!initialPrepare) return "";
    return initialPrepare.recommendedPrimaryId === initialPrepare.primary.id
      ? initialPrepare.duplicate.id
      : initialPrepare.primary.id;
  });
  const prepare = initialPrepare;
  const [selections, setSelections] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of initialPrepare?.fieldComparisons ?? []) {
      initial[field.field] = "primary";
    }
    return initial;
  });
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [confirmArchived, setConfirmArchived] = useState(false);
  const [mergeReason, setMergeReason] = useState("");
  const [resultPrimaryId, setResultPrimaryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const swappedPrepare = useMemo(() => {
    if (!prepare) return null;
    if (primaryId === prepare.primary.id) return prepare;
    return {
      ...prepare,
      primary: prepare.duplicate,
      duplicate: prepare.primary,
      primaryCounts: prepare.duplicateCounts,
      duplicateCounts: prepare.primaryCounts,
      fieldComparisons: prepare.fieldComparisons.map((field) => ({
        ...field,
        primaryValue: field.duplicateValue,
        duplicateValue: field.primaryValue,
      })),
    };
  }, [prepare, primaryId]);

  function continueFromSelect() {
    if (!primaryId || !duplicateId || primaryId === duplicateId) {
      setError("Select two different members.");
      return;
    }
    router.replace(
      `/members/merge?primary=${primaryId}&duplicate=${duplicateId}`,
    );
  }

  function executeMerge() {
    if (!swappedPrepare) return;
    const fd = new FormData();
    fd.set("primaryMemberId", swappedPrepare.primary.id);
    fd.set("duplicateMemberId", swappedPrepare.duplicate.id);
    fd.set("fieldSelections", JSON.stringify(selections));
    fd.set("confirmationPhrase", confirmPhrase);
    fd.set("mergeReason", mergeReason);
    if (confirmArchived) fd.set("confirmArchivedPrimary", "true");

    startTransition(async () => {
      setError(null);
      try {
        const result = await executeMergeAction(fd);
        if (result.status === "error") {
          setError(result.message);
          return;
        }
        setResultPrimaryId(result.primaryMemberId ?? swappedPrepare.primary.id);
        setStep(6);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Merge failed.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap gap-2 text-xs">
        {STEPS.map((label, index) => (
          <li
            key={label}
            className={`rounded-full px-3 py-1 ${
              index === step
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : index < step
                  ? "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
                  : "bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500"
            }`}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {step === 0 ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold">Select Records</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span>Primary member</span>
              <select
                value={primaryId}
                onChange={(event) => setPrimaryId(event.target.value)}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">Select…</option>
                {memberOptions.map((member) => (
                  <option key={member.id} value={member.id}>
                    {getMemberDisplayName(member)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span>Duplicate member</span>
              <select
                value={duplicateId}
                onChange={(event) => setDuplicateId(event.target.value)}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">Select…</option>
                {memberOptions.map((member) => (
                  <option key={member.id} value={member.id}>
                    {getMemberDisplayName(member)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            onClick={continueFromSelect}
            className="mt-4 rounded-md bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Continue
          </button>
        </section>
      ) : null}

      {step === 1 && swappedPrepare && prepare ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold">Choose Primary Record</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            Recommended:{" "}
            {getMemberDisplayName(
              prepare.recommendedPrimaryId === prepare.primary.id
                ? prepare.primary
                : prepare.duplicate,
            )}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-300">
            {prepare.recommendationReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[prepare.primary, prepare.duplicate].map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => {
                  setPrimaryId(member.id);
                  setDuplicateId(
                    member.id === prepare.primary.id
                      ? prepare.duplicate.id
                      : prepare.primary.id,
                  );
                }}
                className={`rounded-md border p-4 text-left ${
                  primaryId === member.id
                    ? "border-zinc-900 dark:border-zinc-100"
                    : "border-zinc-200 dark:border-zinc-700"
                }`}
              >
                <p className="font-medium">{getMemberDisplayName(member)}</p>
                <p className="mt-1 text-sm text-zinc-500">
                  {member.email ?? "No email"} · {member.recordStatus}
                </p>
              </button>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Continue
            </button>
          </div>
        </section>
      ) : null}

      {(step === 2 || step === 3) && swappedPrepare ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold">
            {step === 2 ? "Compare Fields" : "Choose Field Values"}
          </h2>
          <div className="mt-4 space-y-3">
            {swappedPrepare.fieldComparisons.map((field) => (
              <div
                key={field.field}
                className="grid gap-2 rounded-md border border-zinc-200 p-3 sm:grid-cols-[160px_1fr_1fr_auto] dark:border-zinc-700"
              >
                <p className="text-sm font-medium">
                  {formatFieldLabel(field.field)}
                </p>
                <p className="text-sm text-zinc-600 dark:text-zinc-300">
                  Primary: {field.primaryValue || "—"}
                </p>
                <p className="text-sm text-zinc-600 dark:text-zinc-300">
                  Duplicate: {field.duplicateValue || "—"}
                </p>
                {step === 3 ? (
                  <select
                    value={selections[field.field] ?? "primary"}
                    onChange={(event) =>
                      setSelections((prev) => ({
                        ...prev,
                        [field.field]: event.target.value,
                      }))
                    }
                    className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    <option value="primary">Keep primary</option>
                    <option value="duplicate">Use duplicate</option>
                  </select>
                ) : (
                  <span className="text-xs text-zinc-500">Review</span>
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Continue
            </button>
          </div>
        </section>
      ) : null}

      {step === 4 && swappedPrepare ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold">Review Related Records</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            Related records from the duplicate will transfer to the primary.
            Unique constraints (gifts, ministries) keep the stronger assignment.
            Counts only — no confidential content.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold">Primary counts</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {Object.entries(swappedPrepare.primaryCounts).map(([k, v]) => (
                  <li key={k} className="flex justify-between">
                    <span className="text-zinc-500">{k}</span>
                    <span>{v}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold">
                Duplicate counts (to transfer)
              </h3>
              <ul className="mt-2 space-y-1 text-sm">
                {Object.entries(swappedPrepare.duplicateCounts).map(([k, v]) => (
                  <li key={k} className="flex justify-between">
                    <span className="text-zinc-500">{k}</span>
                    <span>{v}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setStep(3)}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep(5)}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Continue
            </button>
          </div>
        </section>
      ) : null}

      {step === 5 && swappedPrepare ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold">Confirm Merge</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            Merge {getMemberDisplayName(swappedPrepare.duplicate)} into{" "}
            {getMemberDisplayName(swappedPrepare.primary)}. This cannot be
            easily undone.
          </p>
          {swappedPrepare.requiresArchivedConfirmation ? (
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={confirmArchived}
                onChange={(event) => setConfirmArchived(event.target.checked)}
              />
              I confirm merging involving an archived record
            </label>
          ) : null}
          <label className="mt-4 block space-y-1 text-sm">
            <span>Reason (optional)</span>
            <input
              value={mergeReason}
              onChange={(event) => setMergeReason(event.target.value)}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>
          <label className="mt-4 block space-y-1 text-sm">
            <span>Type MERGE to confirm</span>
            <input
              value={confirmPhrase}
              onChange={(event) => setConfirmPhrase(event.target.value)}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setStep(4)}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
            >
              Back
            </button>
            <button
              type="button"
              disabled={isPending || confirmPhrase !== "MERGE"}
              onClick={executeMerge}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {isPending ? "Merging..." : "Execute Merge"}
            </button>
          </div>
        </section>
      ) : null}

      {step === 6 ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold">Merge Results</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            The duplicate record is now marked MERGED and related records were
            transferred.
          </p>
          {resultPrimaryId ? (
            <Link
              href={`/member/${resultPrimaryId}`}
              className="mt-4 inline-flex rounded-md bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              View primary member
            </Link>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
