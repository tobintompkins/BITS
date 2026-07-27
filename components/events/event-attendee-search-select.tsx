"use client";

import { useEffect, useId, useState, useTransition } from "react";

import { searchCheckInAttendeesAction } from "@/app/(staff)/events/check-in-actions";

export type SelectableEventAttendee = {
  id: string;
  registrationId: string;
  firstName: string;
  lastName: string;
  confirmationCode: string;
  registrationStatus: string;
};

/**
 * Reuses the existing tenant/event-scoped check-in attendee search action.
 * Displays only safe identifying fields already used in staff event tools.
 */
export function EventAttendeeSearchSelect({
  eventId,
  selected,
  onSelect,
  disabled = false,
  label = "Find registered attendee",
  helpText = "Search by name or confirmation code. Results are limited to this event.",
}: {
  eventId: string;
  selected: SelectableEventAttendee | null;
  onSelect: (attendee: SelectableEventAttendee | null) => void;
  disabled?: boolean;
  label?: string;
  helpText?: string;
}) {
  const listId = useId();
  const inputId = useId();
  const helpId = useId();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SelectableEventAttendee[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (disabled) return;
    const handle = setTimeout(() => {
      startTransition(async () => {
        const formData = new FormData();
        formData.set("eventId", eventId);
        formData.set("query", query);
        formData.set("page", "1");
        formData.set("pageSize", "25");
        const result = await searchCheckInAttendeesAction(formData);
        if (result.status !== "success" || !("items" in result)) {
          setItems([]);
          return;
        }
        const next = (
          result.items as Array<{
            id: string;
            firstName: string;
            lastName: string;
            registration: {
              id: string;
              confirmationCode: string;
              status: string;
            };
          }>
        ).map((item) => ({
          id: item.id,
          registrationId: item.registration.id,
          firstName: item.firstName,
          lastName: item.lastName,
          confirmationCode: item.registration.confirmationCode,
          registrationStatus: item.registration.status,
        }));
        setItems(next);
      });
    }, 250);
    return () => clearTimeout(handle);
  }, [disabled, eventId, query]);

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={inputId} className="block text-sm font-medium">
          {label}
        </label>
        <p id={helpId} className="mt-1 text-xs text-zinc-500">
          {helpText}
        </p>
        <input
          id={inputId}
          type="search"
          value={query}
          disabled={disabled}
          onChange={(event) => setQuery(event.target.value)}
          aria-describedby={helpId}
          aria-controls={listId}
          autoComplete="off"
          className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950"
          placeholder="Name or confirmation code"
        />
      </div>

      {selected ? (
        <div
          className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"
          aria-live="polite"
        >
          <p className="font-medium">
            Selected: {selected.lastName}, {selected.firstName}
          </p>
          <p className="text-xs text-zinc-500">
            {selected.confirmationCode} · {selected.registrationStatus}
          </p>
          <button
            type="button"
            className="mt-2 text-xs underline"
            disabled={disabled}
            onClick={() => onSelect(null)}
          >
            Clear selection
          </button>
        </div>
      ) : null}

      <ul
        id={listId}
        role="listbox"
        aria-label="Matching attendees"
        aria-busy={isPending}
        className="max-h-64 divide-y divide-zinc-100 overflow-y-auto rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800"
      >
        {items.length === 0 ? (
          <li
            className="px-3 py-3 text-sm text-zinc-500"
            role="option"
            aria-selected={false}
            aria-disabled="true"
          >
            {isPending ? "Searching…" : "No matching attendees."}
          </li>
        ) : (
          items.map((item) => {
            const isSelected = selected?.id === item.id;
            return (
              <li key={item.id} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  disabled={disabled}
                  className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-zinc-50 disabled:opacity-50 dark:hover:bg-zinc-900 ${
                    isSelected ? "bg-zinc-100 dark:bg-zinc-900" : ""
                  }`}
                  onClick={() => onSelect(item)}
                >
                  <span className="font-medium">
                    {item.lastName}, {item.firstName}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {item.confirmationCode} · {item.registrationStatus}
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
