import type {
  OriginalV1AcceptanceConfig,
  OriginalV1AcceptanceRole,
} from "@/lib/testing/original-v1-acceptance-config";

type ClerkUserListResponse = {
  data?: Array<{ id: string }>;
};

export async function lookupClerkUserId(
  config: OriginalV1AcceptanceConfig,
  role: OriginalV1AcceptanceRole,
) {
  const email = config.emails[role];
  const url = new URL("https://api.clerk.com/v1/users");
  url.searchParams.set("email_address", email);
  url.searchParams.set("limit", "2");

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${config.clerkSecretKey}`,
      "clerk-api-version": "2025-04-10",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Clerk identity lookup failed for ${role}. Live original-v1 acceptance is blocked until the development Clerk instance returns that fictional user.`,
    );
  }

  const body = (await response.json()) as ClerkUserListResponse | Array<{ id: string }>;
  const users = Array.isArray(body) ? body : (body.data ?? []);
  if (users.length !== 1 || !users[0]?.id) {
    throw new Error(
      `Clerk identity for ${role} was missing or not unique in the development instance. Live original-v1 acceptance is blocked.`,
    );
  }
  return users[0].id;
}

export async function lookupAllClerkUserIds(
  config: OriginalV1AcceptanceConfig,
) {
  const roles: OriginalV1AcceptanceRole[] = [
    "orgAdmin",
    "treasurer",
    "dataEntry",
    "reportViewer",
    "donorA1",
    "donorA2",
    "multiOrg",
  ];
  const entries = await Promise.all(
    roles.map(async (role) => [role, await lookupClerkUserId(config, role)] as const),
  );
  return Object.fromEntries(entries) as Record<OriginalV1AcceptanceRole, string>;
}
