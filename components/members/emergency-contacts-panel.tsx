"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import {
  createEmergencyContactAction,
  deleteEmergencyContactAction,
  setPrimaryEmergencyContactAction,
  updateEmergencyContactAction,
} from "@/app/(staff)/member/emergency-contact-actions";
import { Toast } from "@/components/ui/toast";
import {
  emptyEmergencyContactFormValues,
  type EmergencyContactFormValues,
} from "@/lib/validation/emergency-contact";

type EmergencyContact = {
  id: string;
  name: string;
  relationship: string;
  phone: string;
  email: string | null;
  isPrimary: boolean;
  notes: string | null;
};

type EmergencyContactsPanelProps = {
  memberId: string;
  contacts: EmergencyContact[];
  canEdit: boolean;
};

const inputClassName =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export function EmergencyContactsPanel({
  memberId,
  contacts,
  canEdit,
}: EmergencyContactsPanelProps) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EmergencyContact | null>(null);

  const form = useForm<EmergencyContactFormValues>({
    defaultValues: emptyEmergencyContactFormValues,
  });

  const { register, handleSubmit, reset, formState: { errors } } = form;

  function openCreateForm() {
    setEditingId(null);
    reset(emptyEmergencyContactFormValues);
    setShowForm(true);
  }

  function openEditForm(contact: EmergencyContact) {
    setEditingId(contact.id);
    reset({
      name: contact.name,
      relationship: contact.relationship,
      phone: contact.phone,
      email: contact.email ?? "",
      isPrimary: contact.isPrimary,
      notes: contact.notes ?? "",
    });
    setShowForm(true);
  }

  function submitContact(values: EmergencyContactFormValues) {
    startTransition(async () => {
      setError(null);
      const formData = new FormData();
      Object.entries(values).forEach(([key, value]) => {
        formData.append(key, key === "isPrimary" ? String(value) : String(value ?? ""));
      });

      const result = editingId
        ? await updateEmergencyContactAction(
            memberId,
            editingId,
            { status: "idle", fieldErrors: {} },
            formData,
          )
        : await createEmergencyContactAction(
            memberId,
            { status: "idle", fieldErrors: {} },
            formData,
          );

      if (result.status === "success") {
        setToast(result.message ?? "Saved.");
        setShowForm(false);
        setEditingId(null);
        reset(emptyEmergencyContactFormValues);
        router.refresh();
        return;
      }

      setError(result.message ?? "Unable to save emergency contact.");
    });
  }

  function handleDelete() {
    if (!deleteTarget) {
      return;
    }

    startTransition(async () => {
      try {
        setError(null);
        await deleteEmergencyContactAction(memberId, deleteTarget.id);
        setDeleteTarget(null);
        setToast("Emergency contact deleted.");
        router.refresh();
      } catch (deleteError) {
        setError(
          deleteError instanceof Error
            ? deleteError.message
            : "Unable to delete emergency contact.",
        );
      }
    });
  }

  function handleSetPrimary(contactId: string) {
    startTransition(async () => {
      try {
        setError(null);
        await setPrimaryEmergencyContactAction(memberId, contactId);
        setToast("Primary emergency contact updated.");
        router.refresh();
      } catch (primaryError) {
        setError(
          primaryError instanceof Error
            ? primaryError.message
            : "Unable to set primary contact.",
        );
      }
    });
  }

  return (
    <section className="space-y-6">
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Emergency Contacts
          </h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            People to contact in case of emergency.
          </p>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={openCreateForm}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Add emergency contact
          </button>
        ) : null}
      </div>

      {contacts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900/50">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            No emergency contacts on file.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Relationship</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Primary</th>
                {canEdit ? <th className="px-4 py-3">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <tr key={contact.id} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="px-4 py-3 font-medium">{contact.name}</td>
                  <td className="px-4 py-3">{contact.relationship}</td>
                  <td className="px-4 py-3">{contact.phone}</td>
                  <td className="px-4 py-3">{contact.email ?? "—"}</td>
                  <td className="px-4 py-3">
                    {contact.isPrimary ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                        Primary
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  {canEdit ? (
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => openEditForm(contact)}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          Edit
                        </button>
                        {!contact.isPrimary ? (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleSetPrimary(contact.id)}
                            className="font-medium text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-300"
                          >
                            Set primary
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => setDeleteTarget(contact)}
                          className="font-medium text-red-600 underline-offset-4 hover:underline dark:text-red-400"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && canEdit ? (
        <form
          onSubmit={handleSubmit(submitContact)}
          className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <h4 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {editingId ? "Edit emergency contact" : "Add emergency contact"}
          </h4>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium">Name *</span>
              <input {...register("name")} className={`${inputClassName} mt-1`} />
              {errors.name ? (
                <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
              ) : null}
            </label>
            <label className="block text-sm">
              <span className="font-medium">Relationship *</span>
              <input {...register("relationship")} className={`${inputClassName} mt-1`} />
              {errors.relationship ? (
                <p className="mt-1 text-sm text-red-600">{errors.relationship.message}</p>
              ) : null}
            </label>
            <label className="block text-sm">
              <span className="font-medium">Phone *</span>
              <input {...register("phone")} className={`${inputClassName} mt-1`} />
              {errors.phone ? (
                <p className="mt-1 text-sm text-red-600">{errors.phone.message}</p>
              ) : null}
            </label>
            <label className="block text-sm">
              <span className="font-medium">Email</span>
              <input type="email" {...register("email")} className={`${inputClassName} mt-1`} />
            </label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" {...register("isPrimary")} />
              <span>Primary emergency contact</span>
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="font-medium">Notes</span>
              <textarea
                {...register("notes")}
                rows={3}
                className={`${inputClassName} mt-1`}
              />
            </label>
          </div>
          <div className="mt-4 flex gap-3">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              {isPending ? "Saving..." : "Save contact"}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {contacts.map((contact) =>
        contact.notes ? (
          <p key={`${contact.id}-notes`} className="text-sm text-zinc-600 dark:text-zinc-300">
            <span className="font-medium">{contact.name} notes:</span> {contact.notes}
          </p>
        ) : null,
      )}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
          >
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Delete emergency contact?
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              Remove {deleteTarget.name} from emergency contacts?
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isPending}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white"
              >
                {isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
