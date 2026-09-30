export const DEFAULT_STAFF_IDLE_TIMEOUT_MINUTES = 20;
export const DEFAULT_STAFF_IDLE_WARNING_MINUTES = 2;
export const MIN_STAFF_IDLE_TIMEOUT_MINUTES = 5;
export const MAX_STAFF_IDLE_TIMEOUT_MINUTES = 120;
export const MIN_STAFF_IDLE_WARNING_MINUTES = 1;

export const STAFF_IDLE_TIMEOUT_ENV = "BITS_STAFF_IDLE_TIMEOUT_MINUTES";
export const STAFF_IDLE_WARNING_ENV = "BITS_STAFF_IDLE_WARNING_MINUTES";

export type StaffIdleTimeoutConfig = {
  timeoutMinutes: number;
  warningMinutes: number;
  warningStartsAfterMinutes: number;
};

function parseWholeMinutes(raw: string | null | undefined): number | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!/^[0-9]+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 0) return null;
  return value;
}

function fallbackWarningMinutes(timeoutMinutes: number): number {
  if (DEFAULT_STAFF_IDLE_WARNING_MINUTES < timeoutMinutes) {
    return DEFAULT_STAFF_IDLE_WARNING_MINUTES;
  }
  return Math.min(MIN_STAFF_IDLE_WARNING_MINUTES, timeoutMinutes - 1);
}

export function resolveStaffIdleTimeoutConfig(input?: {
  timeoutMinutes?: string | null;
  warningMinutes?: string | null;
}): StaffIdleTimeoutConfig {
  const parsedTimeout = parseWholeMinutes(input?.timeoutMinutes);
  const timeoutMinutes =
    parsedTimeout != null &&
    parsedTimeout >= MIN_STAFF_IDLE_TIMEOUT_MINUTES &&
    parsedTimeout <= MAX_STAFF_IDLE_TIMEOUT_MINUTES
      ? parsedTimeout
      : DEFAULT_STAFF_IDLE_TIMEOUT_MINUTES;

  const parsedWarning = parseWholeMinutes(input?.warningMinutes);
  const warningMinutes =
    parsedWarning != null &&
    parsedWarning >= MIN_STAFF_IDLE_WARNING_MINUTES &&
    parsedWarning < timeoutMinutes
      ? parsedWarning
      : fallbackWarningMinutes(timeoutMinutes);

  return {
    timeoutMinutes,
    warningMinutes,
    warningStartsAfterMinutes: timeoutMinutes - warningMinutes,
  };
}

export function getStaffIdleTimeoutConfig(): StaffIdleTimeoutConfig {
  return resolveStaffIdleTimeoutConfig({
    timeoutMinutes: process.env[STAFF_IDLE_TIMEOUT_ENV],
    warningMinutes: process.env[STAFF_IDLE_WARNING_ENV],
  });
}

export function staffIdleMinutesToMs(minutes: number): number {
  return minutes * 60 * 1000;
}
