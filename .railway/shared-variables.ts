export const REQUIRED_CLERK_SHARED_KEYS = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
] as const;

export type SharedVariableEntry = {
  value?: string | null;
  isSealed?: boolean;
} | null;

export function missingClerkSharedKeys(
  shared: Record<string, SharedVariableEntry> | undefined,
): string[] {
  return REQUIRED_CLERK_SHARED_KEYS.filter((key) => {
    const entry = shared?.[key];
    if (entry == null) return true;
    if (entry.isSealed === true) return false;
    return typeof entry.value !== "string" || entry.value.trim() === "";
  });
}

export function clerkSharedStopMessage(missing: readonly string[]): string {
  return `Cannot plan: shared variable ${missing.join(", ")} is missing or empty on project bits-test, environment test. Set the development Clerk key in that environment's shared variables. Do not paste the value into git or chat.`;
}
