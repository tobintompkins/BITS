export const GIVING_AUDIT_FROM_LABEL = "From (UTC)";
export const GIVING_AUDIT_THROUGH_LABEL = "Through (UTC)";
export const GIVING_AUDIT_TIMESTAMP_HEADING = "Date & Time (UTC)";
export const GIVING_AUDIT_UTC_HELP =
  "From and Through use UTC calendar days. Each date covers that whole day in UTC, from 00:00 through 23:59. Listed times are UTC.";

export function GivingAuditUtcHelp() {
  return (
    <p className="text-sm leading-6 text-[var(--bits-muted)] md:col-span-2">
      {GIVING_AUDIT_UTC_HELP}
    </p>
  );
}
