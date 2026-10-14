import {
  STAFF_INVITATION_PROVIDER_TIMEOUT_MS,
  clerkLiveInvitesAuthorized,
  getStaffInvitationProviderMode,
  isAllowedLiveInvitationEmail,
  redactStaffInvitationProviderError,
} from "@/lib/staff-invitation/config";

export type StaffInvitationProviderStatus =
  | "pending"
  | "accepted"
  | "revoked"
  | "expired"
  | "unknown";

export type StaffInvitationProviderCreateResult =
  | {
      ok: true;
      providerInvitationId: string;
      status: StaffInvitationProviderStatus;
      emailAddress: string;
    }
  | { ok: false; kind: "timeout" | "error"; redactedError: string };

export type StaffInvitationProviderLookupResult =
  | {
      ok: true;
      providerInvitationId: string;
      status: StaffInvitationProviderStatus;
      emailAddress: string;
    }
  | { ok: false; kind: "not_found" | "timeout" | "error"; redactedError: string };

export type StaffInvitationProviderMembershipResult =
  | {
      ok: true;
      member: boolean;
      clerkUserId: string;
      clerkOrganizationId: string;
    }
  | { ok: false; kind: "timeout" | "error"; redactedError: string };

export type StaffInvitationProviderUserResult =
  | {
      ok: true;
      clerkUserId: string;
      verifiedEmails: string[];
      active: boolean;
    }
  | { ok: false; kind: "not_found" | "timeout" | "error"; redactedError: string };

export type StaffInvitationProvider = {
  createOrganizationInvitation(input: {
    clerkOrganizationId: string;
    emailAddress: string;
    redirectUrl: string;
    expiresInDays: number;
    inviterClerkUserId?: string;
    bitsInvitationId: string;
  }): Promise<StaffInvitationProviderCreateResult>;
  getOrganizationInvitation(input: {
    clerkOrganizationId: string;
    providerInvitationId: string;
  }): Promise<StaffInvitationProviderLookupResult>;
  revokeOrganizationInvitation(input: {
    clerkOrganizationId: string;
    providerInvitationId: string;
    requestingClerkUserId?: string;
  }): Promise<StaffInvitationProviderLookupResult>;
  getOrganizationMembership(input: {
    clerkOrganizationId: string;
    clerkUserId: string;
  }): Promise<StaffInvitationProviderMembershipResult>;
  getUserIdentity(input: {
    clerkUserId: string;
  }): Promise<StaffInvitationProviderUserResult>;
};

export type MockStaffInvitationStore = {
  invitations: Map<
    string,
    {
      id: string;
      clerkOrganizationId: string;
      emailAddress: string;
      status: StaffInvitationProviderStatus;
      bitsInvitationId: string;
    }
  >;
  memberships: Map<string, { clerkOrganizationId: string; clerkUserId: string }>;
  users: Map<
    string,
    { clerkUserId: string; verifiedEmails: string[]; active: boolean }
  >;
  createBehavior: "success" | "error" | "timeout";
  revokeBehavior: "success" | "error" | "timeout";
  getBehavior: "success" | "error" | "timeout" | "not_found";
};

export function createMockStaffInvitationStore(): MockStaffInvitationStore {
  return {
    invitations: new Map(),
    memberships: new Map(),
    users: new Map(),
    createBehavior: "success",
    revokeBehavior: "success",
    getBehavior: "success",
  };
}

const defaultMockStore = createMockStaffInvitationStore();

function membershipKey(clerkOrganizationId: string, clerkUserId: string) {
  return `${clerkOrganizationId}:${clerkUserId}`;
}

async function withProviderTimeout<T>(
  work: () => Promise<T>,
  timeoutMs = STAFF_INVITATION_PROVIDER_TIMEOUT_MS,
): Promise<
  { ok: true; value: T } | { ok: false; kind: "timeout" | "error"; error: unknown }
> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(Object.assign(new Error("TIMEOUT"), { code: "TIMEOUT" }));
        }, timeoutMs);
      }),
    ]);
    return { ok: true, value };
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.message === "TIMEOUT" ||
        ("code" in error && (error as { code?: string }).code === "TIMEOUT"));
    return { ok: false, kind: timedOut ? "timeout" : "error", error };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createMockStaffInvitationProvider(
  store: MockStaffInvitationStore = defaultMockStore,
): StaffInvitationProvider {
  return {
    async createOrganizationInvitation(input) {
      if (store.createBehavior === "timeout") {
        return {
          ok: false,
          kind: "timeout",
          redactedError: "TIMEOUT",
        };
      }
      if (store.createBehavior === "error") {
        return {
          ok: false,
          kind: "error",
          redactedError: "mock_provider_create_failed",
        };
      }
      const id = `orginv_mock_${input.bitsInvitationId.replace(/-/g, "").slice(0, 16)}`;
      store.invitations.set(id, {
        id,
        clerkOrganizationId: input.clerkOrganizationId,
        emailAddress: input.emailAddress,
        status: "pending",
        bitsInvitationId: input.bitsInvitationId,
      });
      return {
        ok: true,
        providerInvitationId: id,
        status: "pending",
        emailAddress: input.emailAddress,
      };
    },
    async getOrganizationInvitation(input) {
      if (store.getBehavior === "timeout") {
        return { ok: false, kind: "timeout", redactedError: "TIMEOUT" };
      }
      if (store.getBehavior === "error") {
        return { ok: false, kind: "error", redactedError: "mock_provider_get_failed" };
      }
      const row = store.invitations.get(input.providerInvitationId);
      if (!row || store.getBehavior === "not_found") {
        return { ok: false, kind: "not_found", redactedError: "not_found" };
      }
      return {
        ok: true,
        providerInvitationId: row.id,
        status: row.status,
        emailAddress: row.emailAddress,
      };
    },
    async revokeOrganizationInvitation(input) {
      if (store.revokeBehavior === "timeout") {
        return { ok: false, kind: "timeout", redactedError: "TIMEOUT" };
      }
      if (store.revokeBehavior === "error") {
        return {
          ok: false,
          kind: "error",
          redactedError: "mock_provider_revoke_failed",
        };
      }
      const row = store.invitations.get(input.providerInvitationId);
      if (!row) {
        return { ok: false, kind: "not_found", redactedError: "not_found" };
      }
      row.status = "revoked";
      return {
        ok: true,
        providerInvitationId: row.id,
        status: "revoked",
        emailAddress: row.emailAddress,
      };
    },
    async getOrganizationMembership(input) {
      return {
        ok: true,
        member: store.memberships.has(
          membershipKey(input.clerkOrganizationId, input.clerkUserId),
        ),
        clerkUserId: input.clerkUserId,
        clerkOrganizationId: input.clerkOrganizationId,
      };
    },
    async getUserIdentity(input) {
      const user = store.users.get(input.clerkUserId);
      if (!user) {
        return { ok: false, kind: "not_found", redactedError: "not_found" };
      }
      return { ok: true, ...user };
    },
  };
}

function mapClerkInvitationStatus(status: string | undefined): StaffInvitationProviderStatus {
  if (status === "pending") return "pending";
  if (status === "accepted") return "accepted";
  if (status === "revoked") return "revoked";
  if (status === "expired") return "expired";
  return "unknown";
}

export function createClerkStaffInvitationProvider(): StaffInvitationProvider {
  async function client() {
    const { clerkClient } = await import("@clerk/nextjs/server");
    return clerkClient();
  }

  return {
    async createOrganizationInvitation(input) {
      if (!clerkLiveInvitesAuthorized()) {
        return {
          ok: false,
          kind: "error",
          redactedError:
            "Live Clerk invitations are disabled. Keep BITS_STAFF_INVITATION_PROVIDER=mock unless a fictional allowlist is explicitly authorized.",
        };
      }
      if (!isAllowedLiveInvitationEmail(input.emailAddress.toLowerCase())) {
        return {
          ok: false,
          kind: "error",
          redactedError: "Recipient is not on the fictional live-invitation allowlist.",
        };
      }
      const raced = await withProviderTimeout(async () => {
        const clerk = await client();
        return clerk.organizations.createOrganizationInvitation({
          organizationId: input.clerkOrganizationId,
          emailAddress: input.emailAddress,
          role: "org:member",
          expiresInDays: input.expiresInDays,
          redirectUrl: input.redirectUrl,
          inviterUserId: input.inviterClerkUserId,
          publicMetadata: { bitsInvitationId: input.bitsInvitationId },
        });
      });
      if (!raced.ok) {
        return {
          ok: false,
          kind: raced.kind,
          redactedError: redactStaffInvitationProviderError(raced.error),
        };
      }
      return {
        ok: true,
        providerInvitationId: raced.value.id,
        status: mapClerkInvitationStatus(raced.value.status),
        emailAddress: raced.value.emailAddress,
      };
    },
    async getOrganizationInvitation(input) {
      const raced = await withProviderTimeout(async () => {
        const clerk = await client();
        return clerk.organizations.getOrganizationInvitation({
          organizationId: input.clerkOrganizationId,
          invitationId: input.providerInvitationId,
        });
      });
      if (!raced.ok) {
        return {
          ok: false,
          kind: raced.kind,
          redactedError: redactStaffInvitationProviderError(raced.error),
        };
      }
      return {
        ok: true,
        providerInvitationId: raced.value.id,
        status: mapClerkInvitationStatus(raced.value.status),
        emailAddress: raced.value.emailAddress,
      };
    },
    async revokeOrganizationInvitation(input) {
      if (!clerkLiveInvitesAuthorized()) {
        return {
          ok: false,
          kind: "error",
          redactedError: "Live Clerk invitation revocation is disabled.",
        };
      }
      const raced = await withProviderTimeout(async () => {
        const clerk = await client();
        return clerk.organizations.revokeOrganizationInvitation({
          organizationId: input.clerkOrganizationId,
          invitationId: input.providerInvitationId,
          requestingUserId: input.requestingClerkUserId,
        });
      });
      if (!raced.ok) {
        return {
          ok: false,
          kind: raced.kind,
          redactedError: redactStaffInvitationProviderError(raced.error),
        };
      }
      return {
        ok: true,
        providerInvitationId: raced.value.id,
        status: mapClerkInvitationStatus(raced.value.status),
        emailAddress: raced.value.emailAddress,
      };
    },
    async getOrganizationMembership(input) {
      const raced = await withProviderTimeout(async () => {
        const clerk = await client();
        return clerk.users.getOrganizationMembershipList({
          userId: input.clerkUserId,
          limit: 100,
        });
      });
      if (!raced.ok) {
        return {
          ok: false,
          kind: raced.kind,
          redactedError: redactStaffInvitationProviderError(raced.error),
        };
      }
      const member = raced.value.data.some(
        (row) => row.organization.id === input.clerkOrganizationId,
      );
      return {
        ok: true,
        member,
        clerkUserId: input.clerkUserId,
        clerkOrganizationId: input.clerkOrganizationId,
      };
    },
    async getUserIdentity(input) {
      const raced = await withProviderTimeout(async () => {
        const clerk = await client();
        return clerk.users.getUser(input.clerkUserId);
      });
      if (!raced.ok) {
        return {
          ok: false,
          kind: raced.kind,
          redactedError: redactStaffInvitationProviderError(raced.error),
        };
      }
      const verifiedEmails = raced.value.emailAddresses
        .filter((row) => row.verification?.status === "verified")
        .map((row) => row.emailAddress.trim().toLowerCase());
      return {
        ok: true,
        clerkUserId: raced.value.id,
        verifiedEmails,
        active: !raced.value.banned && !raced.value.locked,
      };
    },
  };
}

let activeProvider: StaffInvitationProvider | null = null;

export function getStaffInvitationProvider(): StaffInvitationProvider {
  if (activeProvider) return activeProvider;
  if (getStaffInvitationProviderMode() === "clerk") {
    return createClerkStaffInvitationProvider();
  }
  return createMockStaffInvitationProvider();
}

export function setStaffInvitationProviderForTests(
  provider: StaffInvitationProvider | null,
) {
  activeProvider = provider;
}

export function resetDefaultMockStaffInvitationStore() {
  defaultMockStore.invitations.clear();
  defaultMockStore.memberships.clear();
  defaultMockStore.users.clear();
  defaultMockStore.createBehavior = "success";
  defaultMockStore.revokeBehavior = "success";
  defaultMockStore.getBehavior = "success";
}

export function defaultMockStaffInvitationStore() {
  return defaultMockStore;
}
