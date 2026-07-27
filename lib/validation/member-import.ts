import { z } from "zod";

import { membershipStatusValues } from "@/lib/constants/membership-status";
import { DUPLICATE_SCORE_THRESHOLD } from "@/lib/constants/member-lifecycle";
import {
  scoreMemberPair,
  type DuplicateScoreInput,
} from "@/lib/members/duplicate-scoring";
import { memberSchema } from "@/lib/validation/member";
import {
  isValidMembershipStatus,
  mapCsvRowToMemberInput,
  type MemberCsvRow,
} from "@/lib/csv/member-csv";

export type MemberImportRowResult = {
  rowNumber: number;
  status: "valid" | "error" | "skip";
  data?: z.infer<typeof memberSchema>;
  errors: string[];
  email?: string;
};

export function validateMemberImportRow(
  row: MemberCsvRow & { _rowNumber: number },
): MemberImportRowResult {
  const errors: string[] = [];

  if (!row.firstName.trim()) {
    errors.push("firstName is required.");
  }

  if (!row.lastName.trim()) {
    errors.push("lastName is required.");
  }

  if (row.membershipStatus && !isValidMembershipStatus(row.membershipStatus)) {
    errors.push(
      `membershipStatus must be one of: ${membershipStatusValues.join(", ")}.`,
    );
  }

  const mapped = mapCsvRowToMemberInput(row);
  const parsed = memberSchema.safeParse(mapped);

  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    Object.entries(fieldErrors).forEach(([field, messages]) => {
      if (messages?.[0]) {
        errors.push(`${field}: ${messages[0]}`);
      }
    });
  }

  return {
    rowNumber: row._rowNumber,
    status: errors.length > 0 ? "error" : "valid",
    data: parsed.success ? parsed.data : undefined,
    errors,
    email: row.email || undefined,
  };
}

export type MemberImportPreview = {
  totalRows: number;
  validRows: MemberImportRowResult[];
  errorRows: MemberImportRowResult[];
  skipRows: MemberImportRowResult[];
  possibleDuplicateRows: MemberImportRowResult[];
};

export function buildMemberImportPreview(
  rows: Array<MemberCsvRow & { _rowNumber: number }>,
  existingEmails: Set<string>,
  existingMembersForScoring: DuplicateScoreInput[] = [],
): MemberImportPreview {
  const validRows: MemberImportRowResult[] = [];
  const errorRows: MemberImportRowResult[] = [];
  const skipRows: MemberImportRowResult[] = [];
  const possibleDuplicateRows: MemberImportRowResult[] = [];
  const seenEmails = new Set<string>();

  for (const row of rows) {
    const result = validateMemberImportRow(row);

    if (result.status === "error") {
      errorRows.push(result);
      continue;
    }

    const email = result.email?.toLowerCase();

    if (email) {
      if (existingEmails.has(email) || seenEmails.has(email)) {
        skipRows.push({
          ...result,
          status: "skip",
          errors: ["Duplicate email — row skipped."],
        });
        continue;
      }

      seenEmails.add(email);
    }

    if (result.data && existingMembersForScoring.length > 0) {
      const candidate: DuplicateScoreInput = {
        id: `import-row-${row._rowNumber}`,
        firstName: result.data.firstName,
        lastName: result.data.lastName,
        preferredName: result.data.preferredName ?? null,
        email: result.data.email ?? null,
        phone: result.data.phone ?? null,
        alternatePhone: result.data.alternatePhone ?? null,
        dateOfBirth: result.data.dateOfBirth
          ? new Date(`${result.data.dateOfBirth}T00:00:00.000Z`)
          : null,
        addressLine1: result.data.addressLine1 ?? null,
        city: result.data.city ?? null,
        state: result.data.state ?? null,
        postalCode: result.data.postalCode ?? null,
        recordStatus: "ACTIVE",
        householdIds: [],
      };

      let bestScore = 0;
      let bestReasons: string[] = [];
      for (const existing of existingMembersForScoring) {
        const scored = scoreMemberPair(candidate, existing);
        if (scored.score > bestScore) {
          bestScore = scored.score;
          bestReasons = scored.reasons;
        }
      }

      if (bestScore >= DUPLICATE_SCORE_THRESHOLD) {
        possibleDuplicateRows.push({
          ...result,
          status: "valid",
          errors: [
            `Possible duplicate (score ${bestScore}): ${bestReasons.join("; ")}. Review before import.`,
          ],
        });
      }
    }

    validRows.push(result);
  }

  return {
    totalRows: rows.length,
    validRows,
    errorRows,
    skipRows,
    possibleDuplicateRows,
  };
}
