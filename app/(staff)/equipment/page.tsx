import { redirect } from "next/navigation";

import {
  EQUIPMENT_ASSET_TAG_MAX,
  EQUIPMENT_CATEGORY_MAX,
  EQUIPMENT_CONDITION_LABELS,
  EQUIPMENT_CONDITIONS,
  EQUIPMENT_INVENTORY_EMPTY_COPY,
  EQUIPMENT_INVENTORY_NOTICE,
  EQUIPMENT_NAME_MAX,
  EQUIPMENT_NAME_MIN,
  EQUIPMENT_NOTES_MAX,
  EQUIPMENT_QUANTITY_MAX,
  EQUIPMENT_QUANTITY_MIN,
  EQUIPMENT_STATUS_LABELS,
  EQUIPMENT_STATUSES,
  EQUIPMENT_STORAGE_LOCATION_MAX,
  isAttentionCondition,
  type EquipmentInventoryRow,
} from "@/lib/validation/equipment-inventory";
import { getEquipmentInventory } from "@/server/services/equipment-inventory.service";

import {
  archiveEquipmentItemAction,
  createEquipmentItemAction,
  restoreEquipmentItemAction,
  updateEquipmentItemAction,
} from "./actions";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";
const fieldClass =
  "mt-1 w-full rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 text-sm text-[var(--bits-navy)]";

function ConditionLabel({ row }: { row: EquipmentInventoryRow }) {
  return (
    <span
      className={
        isAttentionCondition(row.condition)
          ? "font-medium text-[var(--bits-gold-hover)]"
          : "text-[var(--bits-navy)]"
      }
    >
      {row.conditionLabel}
    </span>
  );
}

function EquipmentFields({ row }: { row?: EquipmentInventoryRow }) {
  return (
    <>
      <label className="text-sm font-medium text-[var(--bits-navy)]">
        Name
        <input
          name="name"
          required
          minLength={EQUIPMENT_NAME_MIN}
          maxLength={EQUIPMENT_NAME_MAX}
          defaultValue={row?.name ?? ""}
          className={fieldClass}
        />
      </label>
      <label className="text-sm font-medium text-[var(--bits-navy)]">
        Category
        <input
          name="category"
          maxLength={EQUIPMENT_CATEGORY_MAX}
          defaultValue={row?.category ?? ""}
          placeholder="Audio, nursery, vehicles"
          className={fieldClass}
        />
      </label>
      <label className="text-sm font-medium text-[var(--bits-navy)]">
        Asset tag
        <input
          name="assetTag"
          maxLength={EQUIPMENT_ASSET_TAG_MAX}
          defaultValue={row?.assetTag ?? ""}
          className={fieldClass}
        />
      </label>
      <label className="text-sm font-medium text-[var(--bits-navy)]">
        Quantity
        <input
          name="quantity"
          type="number"
          required
          min={EQUIPMENT_QUANTITY_MIN}
          max={EQUIPMENT_QUANTITY_MAX}
          defaultValue={row?.quantity ?? 1}
          className={fieldClass}
        />
      </label>
      <label className="text-sm font-medium text-[var(--bits-navy)]">
        Storage location
        <input
          name="storageLocation"
          maxLength={EQUIPMENT_STORAGE_LOCATION_MAX}
          defaultValue={row?.storageLocation ?? ""}
          placeholder="Sound booth, nursery closet"
          className={fieldClass}
        />
      </label>
      <label className="text-sm font-medium text-[var(--bits-navy)]">
        Status
        <select
          name="status"
          defaultValue={row?.status ?? "AVAILABLE"}
          className={fieldClass}
        >
          {EQUIPMENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {EQUIPMENT_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium text-[var(--bits-navy)]">
        Condition
        <select
          name="condition"
          defaultValue={row?.condition ?? "GOOD"}
          className={fieldClass}
        >
          {EQUIPMENT_CONDITIONS.map((condition) => (
            <option key={condition} value={condition}>
              {EQUIPMENT_CONDITION_LABELS[condition]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium text-[var(--bits-navy)] sm:col-span-2">
        Staff notes
        <textarea
          name="notes"
          maxLength={EQUIPMENT_NOTES_MAX}
          defaultValue={row?.notes ?? ""}
          rows={2}
          className={fieldClass}
        />
      </label>
    </>
  );
}

export default async function EquipmentInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    category?: string;
    status?: string;
    storageLocation?: string;
    archived?: string;
    success?: string;
    error?: string;
  }>;
}) {
  const query = await searchParams;
  const inventory = await getEquipmentInventory(query);

  if (inventory.status === "SIGNED_OUT") redirect("/sign-in");
  if (inventory.status === "NO_ORGANIZATION") redirect("/settings/organization");
  if (inventory.status === "UNAUTHORIZED") redirect("/dashboard");

  const rows = inventory.status === "READY" ? inventory.rows : [];
  const counts =
    inventory.status === "READY"
      ? inventory.counts
      : { available: 0, inUse: 0, maintenance: 0, retired: 0 };
  const canManage = inventory.status === "READY" ? inventory.canManage : false;
  const showArchived =
    inventory.status === "READY" ? inventory.showArchived : false;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Church Life
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
          Equipment Inventory
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          {EQUIPMENT_INVENTORY_NOTICE}
        </p>
      </header>

      {inventory.status === "INVALID_FILTER" ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          Choose a valid equipment filter.
        </p>
      ) : null}

      {query.success || query.error ? (
        <p
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm ${
            query.error
              ? "border-rose-300 bg-rose-50 text-rose-800"
              : "border-emerald-300 bg-emerald-50 text-emerald-800"
          }`}
        >
          {query.error ?? query.success}
        </p>
      ) : null}

      <section
        aria-label="Equipment counts"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {[
          { label: "Available", value: counts.available },
          { label: "In Use", value: counts.inUse },
          { label: "Needs Maintenance", value: counts.maintenance },
          { label: "Retired", value: counts.retired },
        ].map((card) => (
          <article
            key={card.label}
            className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-4 shadow-sm"
          >
            <h2 className="text-xs font-medium text-[var(--bits-muted)]">
              {card.label}
            </h2>
            <p className="mt-2 text-2xl font-semibold text-[var(--bits-navy)]">
              {card.value}
            </p>
          </article>
        ))}
      </section>

      {canManage ? (
        <section className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
            Add Equipment
          </h2>
          <form
            action={createEquipmentItemAction}
            className="mt-4 grid gap-4 sm:grid-cols-2"
          >
            <EquipmentFields />
            <div className="sm:col-span-2">
              <button
                type="submit"
                className={`rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
              >
                Add Equipment
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <form
        method="get"
        className="grid gap-4 rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-5"
      >
        <label className="text-sm font-medium text-[var(--bits-navy)]">
          Name
          <input
            name="q"
            defaultValue={query.q ?? ""}
            className={fieldClass}
          />
        </label>
        <label className="text-sm font-medium text-[var(--bits-navy)]">
          Category
          <input
            name="category"
            defaultValue={query.category ?? ""}
            className={fieldClass}
          />
        </label>
        <label className="text-sm font-medium text-[var(--bits-navy)]">
          Status
          <select
            name="status"
            defaultValue={query.status ?? ""}
            className={fieldClass}
          >
            <option value="">All current statuses</option>
            {EQUIPMENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {EQUIPMENT_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-[var(--bits-navy)]">
          Storage location
          <input
            name="storageLocation"
            defaultValue={query.storageLocation ?? ""}
            className={fieldClass}
          />
        </label>
        <label className="flex items-end gap-2 text-sm font-medium text-[var(--bits-navy)]">
          <input
            type="checkbox"
            name="archived"
            value="1"
            defaultChecked={showArchived}
            className="mb-3 h-4 w-4"
          />
          <span className="mb-2">Show archived</span>
        </label>
        <div className="flex items-end lg:col-span-5">
          <button
            type="submit"
            className={`rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
          >
            Apply filter
          </button>
        </div>
      </form>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Inventory
        </h2>
        {rows.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--bits-muted)]">
            {EQUIPMENT_INVENTORY_EMPTY_COPY}
          </p>
        ) : (
          <>
            <ul className="mt-4 grid gap-4 lg:hidden">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="rounded-xl border border-[var(--bits-border)] bg-[var(--bits-page)] p-4"
                >
                  <h3 className="text-lg font-semibold text-[var(--bits-navy)]">
                    {row.name}
                  </h3>
                  <p className="mt-1 text-sm text-[var(--bits-muted)]">
                    {row.category ?? "Uncategorized"} · Qty {row.quantity}
                    {row.storageLocation ? ` · ${row.storageLocation}` : ""}
                  </p>
                  <p className="mt-2 text-sm text-[var(--bits-navy)]">
                    {row.statusLabel} · <ConditionLabel row={row} />
                  </p>
                  <p className="mt-1 text-sm text-[var(--bits-muted)]">
                    Updated {row.updatedOnLabel}
                    {row.archived ? " · Archived" : ""}
                  </p>
                  {canManage ? (
                    <ManagerControls row={row} />
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="mt-4 hidden overflow-x-auto lg:block">
              <table className="min-w-full text-left text-sm">
                <caption className="sr-only">Church equipment inventory</caption>
                <thead>
                  <tr className="border-b border-[var(--bits-border)] text-[var(--bits-muted)]">
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Name
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Category
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Qty
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Storage
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Status
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Condition
                    </th>
                    <th scope="col" className="py-3 font-medium">
                      Updated
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-[var(--bits-border)] align-top last:border-0"
                    >
                      <th
                        scope="row"
                        className="py-3 pr-4 font-semibold text-[var(--bits-navy)]"
                      >
                        {row.name}
                        {row.archived ? (
                          <span className="mt-1 block text-xs font-medium text-[var(--bits-muted)]">
                            Archived
                          </span>
                        ) : null}
                      </th>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.category ?? "—"}
                      </td>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.quantity}
                      </td>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.storageLocation ?? "—"}
                      </td>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.statusLabel}
                      </td>
                      <td className="py-3 pr-4">
                        <ConditionLabel row={row} />
                      </td>
                      <td className="py-3 text-[var(--bits-navy)]">
                        {row.updatedOnLabel}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canManage ? (
              <ul className="mt-6 hidden grid-cols-1 gap-4 lg:grid">
                {rows.map((row) => (
                  <li key={`edit-${row.id}`}>
                    <details className="rounded-xl border border-[var(--bits-border)] p-4">
                      <summary
                        className={`cursor-pointer text-sm font-semibold text-[var(--bits-navy)] ${focusClass}`}
                      >
                        Edit {row.name}
                      </summary>
                      <ManagerControls row={row} />
                    </details>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

function ManagerControls({ row }: { row: EquipmentInventoryRow }) {
  if (row.archived) {
    return (
      <form action={restoreEquipmentItemAction} className="mt-4">
        <input type="hidden" name="equipmentId" value={row.id} />
        <button
          type="submit"
          className={`rounded-xl border border-[var(--bits-border)] px-4 py-2 text-sm font-semibold text-[var(--bits-navy)] ${focusClass}`}
        >
          Restore
          <span className="sr-only"> {row.name}</span>
        </button>
      </form>
    );
  }

  return (
    <div className="mt-4 grid gap-4">
      <form
        action={updateEquipmentItemAction}
        className="grid gap-4 sm:grid-cols-2"
      >
        <input type="hidden" name="equipmentId" value={row.id} />
        <EquipmentFields row={row} />
        <div className="sm:col-span-2">
          <button
            type="submit"
            className={`rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
          >
            Save changes
            <span className="sr-only"> {row.name}</span>
          </button>
        </div>
      </form>
      <form action={archiveEquipmentItemAction}>
        <input type="hidden" name="equipmentId" value={row.id} />
        <button
          type="submit"
          className={`rounded-xl border border-[var(--bits-border)] px-4 py-2 text-sm font-semibold text-[var(--bits-navy)] ${focusClass}`}
        >
          Archive
          <span className="sr-only"> {row.name}</span>
        </button>
      </form>
    </div>
  );
}
