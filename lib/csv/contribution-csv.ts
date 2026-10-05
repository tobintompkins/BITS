import { buildCsv, escapeCsvValue } from "@/lib/csv/member-csv";

export function sanitizeContributionCsvText(value: string) {
  if (/^[\s\u0000-\u001F\u007F]*[=+\-@]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

export function escapeContributionCsvValue(value: string) {
  return escapeCsvValue(sanitizeContributionCsvText(value));
}

export function buildContributionCsv(rows: string[][]) {
  return rows
    .map((row) => row.map(escapeContributionCsvValue).join(","))
    .join("\n");
}

export { buildCsv };
