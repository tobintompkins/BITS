import { membershipStatusValues } from "@/lib/constants/membership-status";

export const MEMBER_CSV_COLUMNS = [
  "firstName",
  "middleName",
  "lastName",
  "preferredName",
  "suffix",
  "email",
  "phone",
  "alternatePhone",
  "dateOfBirth",
  "gender",
  "maritalStatus",
  "membershipStatus",
  "memberSince",
  "baptismDate",
  "salvationDate",
  "address1",
  "address2",
  "city",
  "state",
  "zip",
  "country",
  "notes",
] as const;

export type MemberCsvColumn = (typeof MEMBER_CSV_COLUMNS)[number];

export type MemberCsvRow = Record<MemberCsvColumn, string>;

export function escapeCsvValue(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

export function buildCsv(rows: string[][]) {
  return rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
}

export function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentValue += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ",") {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      currentRow.push(currentValue);
      if (currentRow.some((cell) => cell.trim() !== "")) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentValue = "";
      continue;
    }

    currentValue += char;
  }

  currentRow.push(currentValue);
  if (currentRow.some((cell) => cell.trim() !== "")) {
    rows.push(currentRow);
  }

  return rows;
}

export function parseMemberCsv(content: string) {
  const rows = parseCsv(content.trim());

  if (rows.length === 0) {
    return { headers: [] as string[], dataRows: [] as Array<MemberCsvRow & { _rowNumber: number }> };
  }

  const [headerRow, ...bodyRows] = rows;
  const headers = headerRow.map((header) => header.trim());

  const dataRows = bodyRows.map((row, rowIndex) => {
    const record = Object.fromEntries(
      MEMBER_CSV_COLUMNS.map((column) => [column, ""]),
    ) as MemberCsvRow;

    headers.forEach((header, columnIndex) => {
      if (MEMBER_CSV_COLUMNS.includes(header as MemberCsvColumn)) {
        record[header as MemberCsvColumn] = (row[columnIndex] ?? "").trim();
      }
    });

    return { ...record, _rowNumber: rowIndex + 2 };
  });

  return { headers, dataRows };
}

export function getMemberCsvTemplate() {
  const sampleRow = [
    "Alex",
    "",
    "Rivera",
    "",
    "",
    "alex.rivera@example.org",
    "(615) 555-1001",
    "",
    "1990-01-15",
    "Female",
    "Married",
    "VISITOR",
    "",
    "",
    "",
    "100 Main Street",
    "",
    "Nashville",
    "TN",
    "37203",
    "US",
    "Sample member row",
  ];

  return buildCsv([MEMBER_CSV_COLUMNS as unknown as string[], sampleRow]);
}

export function isValidMembershipStatus(
  value: string,
): value is (typeof membershipStatusValues)[number] {
  return membershipStatusValues.includes(
    value as (typeof membershipStatusValues)[number],
  );
}

export function mapCsvRowToMemberInput(row: MemberCsvRow) {
  return {
    firstName: row.firstName,
    middleName: row.middleName,
    lastName: row.lastName,
    preferredName: row.preferredName,
    suffix: row.suffix,
    email: row.email,
    phone: row.phone,
    alternatePhone: row.alternatePhone,
    dateOfBirth: row.dateOfBirth,
    gender: row.gender,
    maritalStatus: row.maritalStatus,
    membershipStatus: row.membershipStatus || "VISITOR",
    memberSince: row.memberSince,
    baptismDate: row.baptismDate,
    salvationDate: row.salvationDate,
    addressLine1: row.address1,
    addressLine2: row.address2,
    city: row.city,
    state: row.state,
    postalCode: row.zip,
    country: row.country || "US",
    notes: row.notes,
    householdId: "",
  };
}

export type MemberExportRecord = {
  firstName: string;
  middleName: string | null;
  lastName: string;
  preferredName: string | null;
  suffix: string | null;
  email: string | null;
  phone: string | null;
  alternatePhone: string | null;
  dateOfBirth: Date | null;
  gender: string | null;
  maritalStatus: string | null;
  membershipStatus: string;
  memberSince: Date | null;
  baptismDate: Date | null;
  salvationDate: Date | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  notes: string | null;
  householdLinks: Array<{ household: { householdName: string } }>;
  recordStatus?: string | null;
  preferredContactMethod?: string | null;
  allowEmail?: boolean | null;
  allowSms?: boolean | null;
  allowPhoneCalls?: boolean | null;
  allowPostalMail?: boolean | null;
  allowDirectoryListing?: boolean | null;
  primarySpiritualGift?: string | null;
  activeMinistries?: string | null;
  skills?: string | null;
  availableToServe?: boolean | null;
  milestoneSummary?: string | null;
};

export function formatDateForCsv(value: Date | null) {
  if (!value) {
    return "";
  }

  return value.toISOString().slice(0, 10);
}

export function buildMemberExportCsv(
  members: MemberExportRecord[],
  options?: { includeEngagement?: boolean },
) {
  const includeEngagement = options?.includeEngagement ?? true;
  const exportColumns = [
    ...MEMBER_CSV_COLUMNS,
    "householdName",
    "recordStatus",
    "preferredContactMethod",
    "allowEmail",
    "allowSms",
    "allowPhoneCalls",
    "allowPostalMail",
    "allowDirectoryListing",
    ...(includeEngagement
      ? ([
          "primarySpiritualGift",
          "activeMinistries",
          "skills",
          "availableToServe",
          "milestoneSummary",
        ] as const)
      : []),
  ];

  const rows = members.map((member) => {
    const base = [
      member.firstName,
      member.middleName ?? "",
      member.lastName,
      member.preferredName ?? "",
      member.suffix ?? "",
      member.email ?? "",
      member.phone ?? "",
      member.alternatePhone ?? "",
      formatDateForCsv(member.dateOfBirth),
      member.gender ?? "",
      member.maritalStatus ?? "",
      member.membershipStatus,
      formatDateForCsv(member.memberSince),
      formatDateForCsv(member.baptismDate),
      formatDateForCsv(member.salvationDate),
      member.addressLine1 ?? "",
      member.addressLine2 ?? "",
      member.city ?? "",
      member.state ?? "",
      member.postalCode ?? "",
      member.country ?? "",
      member.notes ?? "",
      member.householdLinks[0]?.household.householdName ?? "",
      member.recordStatus ?? "",
      member.preferredContactMethod ?? "",
      member.allowEmail === false ? "No" : "Yes",
      member.allowSms === false ? "No" : "Yes",
      member.allowPhoneCalls === false ? "No" : "Yes",
      member.allowPostalMail === false ? "No" : "Yes",
      member.allowDirectoryListing === false ? "No" : "Yes",
    ];

    if (!includeEngagement) {
      return base;
    }

    return [
      ...base,
      member.primarySpiritualGift ?? "",
      member.activeMinistries ?? "",
      member.skills ?? "",
      member.availableToServe ? "Yes" : "No",
      member.milestoneSummary ?? "",
    ];
  });

  return buildCsv([exportColumns as unknown as string[], ...rows]);
}
