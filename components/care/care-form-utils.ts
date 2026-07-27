export const inputClassName =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-500 dark:focus:ring-zinc-800 dark:disabled:bg-zinc-800";

export const sectionClassName =
  "rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900";

export const sectionHeaderClassName =
  "border-b border-zinc-200 px-4 py-4 sm:px-6 dark:border-zinc-800";

export const sectionBodyClassName = "grid gap-4 px-4 py-6 sm:px-6 md:grid-cols-2";

export type MemberOption = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName?: string | null;
  middleName?: string | null;
  suffix?: string | null;
};

export type StaffOption = {
  id: string;
  displayName: string | null;
  primaryEmail: string | null;
};

export function toDateInputValue(date: Date | string | null | undefined): string {
  if (!date) return "";
  const value = typeof date === "string" ? new Date(date) : date;
  return value.toISOString().slice(0, 10);
}

export function toTimeInputValue(date: Date | null | undefined): string {
  if (!date) return "";
  const hours = date.getUTCHours().toString().padStart(2, "0");
  const minutes = date.getUTCMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function formatStaffLabel(staff: StaffOption): string {
  return staff.displayName?.trim() || staff.primaryEmail || "Staff user";
}
