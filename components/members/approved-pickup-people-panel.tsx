"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import {
  createApprovedPickupAction,
  deactivateApprovedPickupAction,
  deleteApprovedPickupAction,
  reactivateApprovedPickupAction,
  updateApprovedPickupAction,
} from "@/app/(staff)/member/approved-pickup-actions";
import {
  MEMBER_APPROVED_PICKUP_SAFETY_NOTE,
  approvedPickupWriteSchema,
  emptyApprovedPickupFormValues,
  type MemberApprovedPickupFormValues,
  type MemberApprovedPickupRow,
} from "@/lib/validation/member-approved-pickups";

type ApprovedPickupPeoplePanelProps = {
  memberId: string;
  rows: MemberApprovedPickupRow[];
};

const inputClassName =
  "w-full rounded-md border border-[var(--bits-border)] bg-white px-3 py-2 text-sm text-[var(--bits-navy)] shadow-sm outline-none transition focus:border-[var(--bits-gold)] focus:ring-2 focus:ring-[var(--bits-gold)]/30";

function fieldError(
  fieldErrors: Partial<Record<keyof MemberApprovedPickupFormValues, string[]>>,
  field: keyof MemberApprovedPickupFormValues,
) {
  return fieldErrors[field]?.[0] ?? null;
}

export function ApprovedPickupPeoplePanel({
  memberId,
  rows,
}: ApprovedPickupPeoplePanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusKind, setStatusKind] = useState<"success" | "error" | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof MemberApprovedPickupFormValues, string[]>>
  >({});
  const [formValues, setFormValues] = useState(emptyApprovedPickupFormValues);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [removeTargetId, setRemoveTargetId] = useState<string | null>(null);

  function resetForm() {
    setFormValues(emptyApprovedPickupFormValues);
    setFieldErrors({});
    setEditingId(null);
    setShowForm(false);
  }

  function openCreateForm() {
    setEditingId(null);
    setFormValues(emptyApprovedPickupFormValues);
    setFieldErrors({});
    setShowForm(true);
    setStatusMessage(null);
    setStatusKind(null);
  }

  function openEditForm(row: MemberApprovedPickupRow) {
    setEditingId(row.id);
    setFormValues({
      firstName: row.firstName,
      lastName: row.lastName,
      relationship: row.relationship,
    });
    setFieldErrors({});
    setShowForm(true);
    setRemoveTargetId(null);
    setStatusMessage(null);
    setStatusKind(null);
  }

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = approvedPickupWriteSchema.safeParse(formValues);
    if (!parsed.success) {
      setFieldErrors(parsed.error.flatten().fieldErrors);
      setStatusKind("error");
      setStatusMessage("Please correct the highlighted fields.");
      return;
    }

    const formData = new FormData();
    formData.set("firstName", parsed.data.firstName);
    formData.set("lastName", parsed.data.lastName);
    formData.set("relationship", parsed.data.relationship);

    startTransition(async () => {
      const result = editingId
        ? await updateApprovedPickupAction(
            memberId,
            editingId,
            { status: "idle", fieldErrors: {} },
            formData,
          )
        : await createApprovedPickupAction(
            memberId,
            { status: "idle", fieldErrors: {} },
            formData,
          );

      if (result.status === "success") {
        setStatusKind("success");
        setStatusMessage(result.message ?? "Saved.");
        setFieldErrors({});
        resetForm();
        router.refresh();
        return;
      }

      setStatusKind("error");
      setStatusMessage(result.message ?? "Unable to save that record.");
      setFieldErrors(result.fieldErrors ?? {});
    });
  }

  function runSimpleAction(
    action: () => Promise<{ status: "success" | "error"; message: string }>,
  ) {
    startTransition(async () => {
      const result = await action();
      setStatusKind(result.status);
      setStatusMessage(result.message);
      if (result.status === "success") {
        setRemoveTargetId(null);
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-xl border border-[var(--bits-border)] bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
            Approved pickup people
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--bits-navy)]/80">
            {MEMBER_APPROVED_PICKUP_SAFETY_NOTE}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateForm}
          className="rounded-md bg-[var(--bits-navy)] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[var(--bits-navy)]/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          Add approved person
        </button>
      </div>

      <div
        aria-live="polite"
        className={
          statusMessage
            ? statusKind === "success"
              ? "mt-4 rounded-md border border-[var(--bits-gold)] bg-[var(--bits-gold)]/15 px-3 py-2 text-sm text-[var(--bits-navy)]"
              : "mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            : "sr-only"
        }
      >
        {statusMessage ?? ""}
      </div>

      {showForm ? (
        <form
          onSubmit={submitForm}
          className="mt-5 grid gap-4 rounded-lg border border-[var(--bits-border)] bg-[#f5f6f8] p-4 sm:grid-cols-3"
        >
          <label className="block text-sm font-medium text-[var(--bits-navy)]">
            First name
            <input
              className={inputClassName}
              value={formValues.firstName}
              onChange={(event) =>
                setFormValues((current) => ({
                  ...current,
                  firstName: event.target.value,
                }))
              }
              autoComplete="off"
              maxLength={50}
            />
            {fieldError(fieldErrors, "firstName") ? (
              <span className="mt-1 block text-xs text-red-700">
                {fieldError(fieldErrors, "firstName")}
              </span>
            ) : null}
          </label>
          <label className="block text-sm font-medium text-[var(--bits-navy)]">
            Last name
            <input
              className={inputClassName}
              value={formValues.lastName}
              onChange={(event) =>
                setFormValues((current) => ({
                  ...current,
                  lastName: event.target.value,
                }))
              }
              autoComplete="off"
              maxLength={50}
            />
            {fieldError(fieldErrors, "lastName") ? (
              <span className="mt-1 block text-xs text-red-700">
                {fieldError(fieldErrors, "lastName")}
              </span>
            ) : null}
          </label>
          <label className="block text-sm font-medium text-[var(--bits-navy)]">
            Relationship
            <input
              className={inputClassName}
              value={formValues.relationship}
              onChange={(event) =>
                setFormValues((current) => ({
                  ...current,
                  relationship: event.target.value,
                }))
              }
              autoComplete="off"
              maxLength={40}
              placeholder="Parent, Grandparent, Family Friend"
            />
            {fieldError(fieldErrors, "relationship") ? (
              <span className="mt-1 block text-xs text-red-700">
                {fieldError(fieldErrors, "relationship")}
              </span>
            ) : null}
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-3">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-[var(--bits-navy)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {editingId ? "Save changes" : "Add to list"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-md border border-[var(--bits-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--bits-navy)]"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {rows.length === 0 ? (
        <p className="mt-5 text-sm text-[var(--bits-navy)]/75">
          No approved pickup people have been recorded yet.
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-[var(--bits-border)]">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium text-[var(--bits-navy)]">
                  {row.firstName} {row.lastName}
                </p>
                <p className="text-sm text-[var(--bits-navy)]/75">{row.relationship}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={
                    row.isActive
                      ? "rounded-full bg-[var(--bits-navy)] px-2.5 py-0.5 text-xs font-semibold text-white"
                      : "rounded-full bg-[var(--bits-border)] px-2.5 py-0.5 text-xs font-semibold text-[var(--bits-navy)]"
                  }
                >
                  {row.isActive ? "Active" : "Inactive"}
                </span>
                <button
                  type="button"
                  onClick={() => openEditForm(row)}
                  className="rounded-md border border-[var(--bits-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--bits-navy)]"
                >
                  Edit
                </button>
                {row.isActive ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      runSimpleAction(() =>
                        deactivateApprovedPickupAction(memberId, row.id),
                      )
                    }
                    className="rounded-md border border-[var(--bits-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--bits-navy)] disabled:opacity-60"
                  >
                    Deactivate
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      runSimpleAction(() =>
                        reactivateApprovedPickupAction(memberId, row.id),
                      )
                    }
                    className="rounded-md border border-[var(--bits-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--bits-navy)] disabled:opacity-60"
                  >
                    Reactivate
                  </button>
                )}
                {removeTargetId === row.id ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() =>
                        runSimpleAction(() =>
                          deleteApprovedPickupAction(memberId, row.id),
                        )
                      }
                      className="rounded-md bg-[var(--bits-navy)] px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      Confirm remove
                    </button>
                    <button
                      type="button"
                      onClick={() => setRemoveTargetId(null)}
                      className="rounded-md border border-[var(--bits-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--bits-navy)]"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setRemoveTargetId(row.id)}
                    className="rounded-md border border-[var(--bits-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--bits-navy)]"
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
