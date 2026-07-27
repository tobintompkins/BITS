type AuditEventRecord = {
  id: string;
  action: string;
  occurredAt: Date;
  changeMetadata: unknown;
  actor: {
    displayName: string | null;
    primaryEmail: string;
  } | null;
};

type AuditChange = {
  field: string;
  oldValue: string | null;
  newValue: string | null;
};

function formatFieldName(field: string) {
  return field
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase());
}

function getChanges(metadata: unknown): AuditChange[] {
  if (
    metadata &&
    typeof metadata === "object" &&
    "changes" in metadata &&
    Array.isArray(metadata.changes)
  ) {
    return metadata.changes as AuditChange[];
  }

  return [];
}

export function OrganizationAuditLog({
  events,
}: {
  events: AuditEventRecord[];
}) {
  if (events.length === 0) {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-4 py-4 sm:px-6 dark:border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Audit Log
          </h2>
        </div>
        <p className="px-4 py-6 text-sm text-zinc-600 sm:px-6 dark:text-zinc-300">
          Changes to organization settings will appear here.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="border-b border-zinc-200 px-4 py-4 sm:px-6 dark:border-zinc-800">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Audit Log
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          Recent organization settings changes.
        </p>
      </div>
      <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {events.map((event) => {
          const actorName =
            event.actor?.displayName ?? event.actor?.primaryEmail ?? "System";
          const changes = getChanges(event.changeMetadata);

          return (
            <article
              key={event.id}
              className="space-y-3 px-4 py-4 sm:px-6"
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {event.action} by {actorName}
                </p>
                <time
                  dateTime={event.occurredAt.toISOString()}
                  className="text-xs text-zinc-500 dark:text-zinc-400"
                >
                  {event.occurredAt.toLocaleString()}
                </time>
              </div>
              <ul className="space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
                {changes.map((change) => (
                  <li
                    key={`${event.id}-${change.field}`}
                    className="rounded-md bg-zinc-50 px-3 py-2 dark:bg-zinc-800/60"
                  >
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {formatFieldName(change.field)}:
                    </span>{" "}
                    <span className="text-red-600 line-through dark:text-red-400">
                      {change.oldValue || "(empty)"}
                    </span>{" "}
                    <span className="text-zinc-500 dark:text-zinc-400">→</span>{" "}
                    <span className="text-emerald-700 dark:text-emerald-300">
                      {change.newValue || "(empty)"}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
}
