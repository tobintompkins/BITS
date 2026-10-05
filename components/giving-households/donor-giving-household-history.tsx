import Link from "next/link";

import { formatDateOnly, GIVING_HOUSEHOLD_HISTORY_COPY } from "@/lib/validation/giving-household";
import {
  GivingHouseholdError,
  getDonorGivingHouseholdHistory,
} from "@/server/services/giving-household.service";

function asDateOnly(value: Date | string) {
  return typeof value === "string" ? value.slice(0, 10) : formatDateOnly(value);
}

export async function DonorGivingHouseholdHistory({ donorId }: { donorId: string }) {
  let data;
  try {
    data = await getDonorGivingHouseholdHistory(donorId);
  } catch (error) {
    if (error instanceof GivingHouseholdError) return null;
    throw error;
  }

  return (
    <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-6">
      <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
        Giving household history
      </h2>
      <p className="mt-2 text-sm text-[var(--bits-muted)]">
        {GIVING_HOUSEHOLD_HISTORY_COPY}
      </p>
      {data.memberships.length ? (
        <ul className="mt-4 space-y-2">
          {data.memberships.map((row) => (
            <li key={row.id} className="text-sm">
              <Link
                className="underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                href={`/giving-households/${row.household.id}`}
              >
                {row.household.displayName}
              </Link>
              {` · ${asDateOnly(row.startDate)}`}
              {row.endDate ? ` through ${asDateOnly(row.endDate)}` : " · Current"}
              {row.household.active ? "" : " · Inactive household"}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm">This donor is not linked to a giving household.</p>
      )}
    </section>
  );
}
