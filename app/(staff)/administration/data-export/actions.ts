"use server";

import { exportChurchData } from "@/server/services/church-data-export.service";

const ERRORS = {
  SIGNED_OUT: "You must be signed in.",
  NO_ORGANIZATION: "The church organization has not been configured.",
  UNAUTHORIZED: "You do not have permission to export church records.",
  INVALID: "Choose a valid export and try again.",
  UNCONFIRMED: "Please confirm that you understand this export may contain private church information.",
} as const;

export async function exportChurchDataAction(input: unknown) {
  const result = await exportChurchData(input);
  if (result.status === "EXPORTED") {
    return {
      ok: true as const,
      csv: result.csv,
      filename: result.filename,
      rowCount: result.rowCount,
      message: result.message,
    };
  }

  const error =
    result.status === "SIGNED_OUT"
      ? ERRORS.SIGNED_OUT
      : result.status === "NO_ORGANIZATION"
        ? ERRORS.NO_ORGANIZATION
        : result.status === "UNAUTHORIZED"
          ? ERRORS.UNAUTHORIZED
          : result.status === "UNCONFIRMED"
            ? ERRORS.UNCONFIRMED
            : ERRORS.INVALID;

  return {
    ok: false as const,
    error,
  };
}
