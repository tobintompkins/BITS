export const STAFF_INVITATION_PROVIDER_TIMEOUT_MS = 8_000;
export const STAFF_INVITATION_MIGRATION = "20261014180000_add_staff_invitations";

export type StaffInvitationProviderMode = "mock" | "clerk";

type EnvMap = Record<string, string | undefined>;

function read(env: EnvMap, name: string) {
  return env[name]?.trim() ?? "";
}

export function getStaffInvitationProviderMode(
  env: EnvMap = process.env,
): StaffInvitationProviderMode {
  return read(env, "BITS_STAFF_INVITATION_PROVIDER").toLowerCase() === "clerk"
    ? "clerk"
    : "mock";
}

export function getStaffInvitationRedirectOrigin(
  env: EnvMap = process.env,
) {
  const configured =
    read(env, "BITS_STAFF_INVITATION_REDIRECT_ORIGIN") ||
    read(env, "APP_BASE_URL");
  if (!configured) {
    return {
      ok: false as const,
      message: "Staff invitation redirect origin is not configured.",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    return {
      ok: false as const,
      message: "Staff invitation redirect origin is not a valid URL.",
    };
  }

  if (parsed.username || parsed.password) {
    return {
      ok: false as const,
      message: "Staff invitation redirect origin must not include credentials.",
    };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      ok: false as const,
      message: "Staff invitation redirect origin must be http or https.",
    };
  }

  return {
    ok: true as const,
    origin: `${parsed.protocol}//${parsed.host}`,
  };
}

export function staffInvitationAcceptUrl(origin: string, invitationId: string) {
  const url = new URL("/staff-invitations/accept", origin);
  url.searchParams.set("intent", invitationId);
  return url.toString();
}

export function clerkLiveInvitesAuthorized(
  env: EnvMap = process.env,
) {
  return (
    getStaffInvitationProviderMode(env) === "clerk" &&
    read(env, "BITS_STAFF_INVITATION_ALLOW_LIVE") === "1" &&
    read(env, "CLERK_SECRET_KEY").startsWith("sk_test_")
  );
}

export function isAllowedLiveInvitationEmail(
  emailNormalized: string,
  env: EnvMap = process.env,
) {
  const allowed = read(env, "BITS_STAFF_INVITATION_ALLOWED_EMAILS")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(emailNormalized);
}

export function redactStaffInvitationProviderError(error: unknown) {
  const raw =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === "string"
        ? error
        : "provider_error";
  return raw
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/sk_(?:test|live)_[A-Za-z0-9]+/g, "[redacted-secret]")
    .replace(/orginv_[A-Za-z0-9]+/g, "[redacted-invitation]")
    .replace(/user_[A-Za-z0-9]+/g, "[redacted-user]")
    .replace(/org_[A-Za-z0-9]+/g, "[redacted-org]")
    .slice(0, 240);
}
