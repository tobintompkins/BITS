import { beforeEach, describe, expect, it, vi } from "vitest";

import { RegistrationError } from "@/lib/errors/registration-errors";

const store = vi.hoisted(() => ({
  lastFindWhere: null as unknown,
  lastFindSelect: null as unknown,
  owned: null as {
    confirmationCode: string;
    eventId: string;
    event: { slug: string };
    status?: string;
    cancellationReason?: string;
    attendees?: unknown;
    notes?: string;
    primaryContactEmail?: string;
  } | null,
}));

const mocks = vi.hoisted(() => ({
  getOrCreateUserAccount: vi.fn(),
  findPrimaryOrganization: vi.fn(),
  cancelRegistration: vi.fn(),
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.getOrCreateUserAccount,
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findPrimaryOrganization: mocks.findPrimaryOrganization,
}));

vi.mock("@/server/services/event-registration.service", () => ({
  cancelRegistration: mocks.cancelRegistration,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    eventRegistration: {
      findFirst: async ({
        where,
        select,
      }: {
        where: Record<string, unknown>;
        select: unknown;
      }) => {
        store.lastFindWhere = where;
        store.lastFindSelect = select;
        if (!store.owned) return null;
        if (where.id !== OWN_REG) return null;
        if (where.organizationId !== ORG_ID) return null;
        if (where.registeredByUserId !== USER_ID) return null;
        return {
          confirmationCode: store.owned.confirmationCode,
          eventId: store.owned.eventId,
          event: { slug: store.owned.event.slug },
        };
      },
    },
  },
}));

import { cancelMemberEventRegistration } from "./member-event-registration-cancellation.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const OTHER_USER = "00000000-0000-4000-8000-00000000c002";
const OWN_REG = "00000000-0000-4000-8000-00000000d001";
const OTHER_USER_REG = "00000000-0000-4000-8000-00000000d004";
const EVENT_ID = "00000000-0000-4000-8000-00000000e001";
const CONFIRMATION_CODE = "SUN-7K2P";
const OWN_EMAIL = "ann@church.test";

function seedOwned() {
  store.owned = {
    confirmationCode: CONFIRMATION_CODE,
    eventId: EVENT_ID,
    event: { slug: "sunday-worship" },
    status: "CONFIRMED",
    cancellationReason: "changed plans",
    notes: "staff only registration memo",
    primaryContactEmail: OWN_EMAIL,
    attendees: [{ firstName: "Hidden", lastName: "Child" }],
  };
  store.lastFindWhere = null;
  store.lastFindSelect = null;
}

describe("member event registration cancellation", () => {
  beforeEach(() => {
    seedOwned();
    vi.clearAllMocks();
    mocks.findPrimaryOrganization.mockResolvedValue({
      id: ORG_ID,
      name: "First United Pentecostal Church of Saco",
    });
    mocks.getOrCreateUserAccount.mockResolvedValue({
      id: USER_ID,
      primaryEmail: OWN_EMAIL,
      displayName: "Ann Adams",
    });
    mocks.cancelRegistration.mockResolvedValue({
      id: OWN_REG,
      eventId: EVENT_ID,
      confirmationCode: CONFIRMATION_CODE,
      status: "CANCELLED",
      cancellationReason: "changed plans",
      primaryContactEmail: OWN_EMAIL,
      attendees: [{ firstName: "Hidden", lastName: "Child" }],
      notes: "staff only registration memo",
    });
  });

  it("returns signed out without looking up or cancelling", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    await expect(
      cancelMemberEventRegistration({ registrationId: OWN_REG }),
    ).resolves.toEqual({ status: "SIGNED_OUT" });
    expect(store.lastFindWhere).toBeNull();
    expect(mocks.cancelRegistration).not.toHaveBeenCalled();
  });

  it("returns a safe no-organization state without looking up or cancelling", async () => {
    mocks.findPrimaryOrganization.mockResolvedValue(null);
    await expect(
      cancelMemberEventRegistration({ registrationId: OWN_REG }),
    ).resolves.toEqual({ status: "NO_ORGANIZATION" });
    expect(store.lastFindWhere).toBeNull();
    expect(mocks.cancelRegistration).not.toHaveBeenCalled();
  });

  it("treats an invalid registration id as not found and does not query", async () => {
    await expect(
      cancelMemberEventRegistration({
        registrationId: "not-a-uuid",
        confirmationCode: CONFIRMATION_CODE,
      } as { registrationId?: string }),
    ).resolves.toEqual({ status: "NOT_FOUND" });
    expect(store.lastFindWhere).toBeNull();
    expect(mocks.cancelRegistration).not.toHaveBeenCalled();
  });

  it("scopes lookup by organization, registration id, and signed-in user id only", async () => {
    await cancelMemberEventRegistration({
      registrationId: OWN_REG,
      reason: "schedule conflict",
    });
    expect(store.lastFindWhere).toEqual({
      id: OWN_REG,
      organizationId: ORG_ID,
      registeredByUserId: USER_ID,
    });
    expect(JSON.stringify(store.lastFindWhere)).not.toContain("email");
    expect(JSON.stringify(store.lastFindWhere)).not.toContain(OWN_EMAIL);
    expect(JSON.stringify(store.lastFindWhere)).not.toContain(CONFIRMATION_CODE);
    expect(store.lastFindSelect).toEqual({
      confirmationCode: true,
      eventId: true,
      event: { select: { slug: true } },
    });
  });

  it("cannot cancel another account's registration even with the id", async () => {
    await expect(
      cancelMemberEventRegistration({
        registrationId: OTHER_USER_REG,
        actorUserAccountId: OTHER_USER,
        confirmationCode: "SUN-OTHER",
        email: OWN_EMAIL,
      } as { registrationId?: string; reason?: string }),
    ).resolves.toEqual({ status: "NOT_FOUND" });
    expect(store.lastFindWhere).toEqual({
      id: OTHER_USER_REG,
      organizationId: ORG_ID,
      registeredByUserId: USER_ID,
    });
    expect(mocks.cancelRegistration).not.toHaveBeenCalled();
  });

  it("does not cancel a registration from another organization", async () => {
    mocks.findPrimaryOrganization.mockResolvedValue({
      id: OTHER_ORG,
      name: "Other Church",
    });
    await expect(
      cancelMemberEventRegistration({ registrationId: OWN_REG }),
    ).resolves.toEqual({ status: "NOT_FOUND" });
    expect(store.lastFindWhere).toEqual({
      id: OWN_REG,
      organizationId: OTHER_ORG,
      registeredByUserId: USER_ID,
    });
    expect(mocks.cancelRegistration).not.toHaveBeenCalled();
  });

  it("delegates disabled cancellation from the existing service", async () => {
    mocks.cancelRegistration.mockRejectedValue(
      new RegistrationError(
        "CANCELLATION_DISABLED",
        "Cancellation is not allowed for this event.",
      ),
    );
    await expect(
      cancelMemberEventRegistration({ registrationId: OWN_REG }),
    ).resolves.toEqual({ status: "CANCELLATION_DISABLED" });
    expect(mocks.cancelRegistration).toHaveBeenCalledOnce();
  });

  it("delegates a passed cancellation deadline from the existing service", async () => {
    mocks.cancelRegistration.mockRejectedValue(
      new RegistrationError(
        "CANCELLATION_DEADLINE_PASSED",
        "The cancellation deadline has passed.",
      ),
    );
    await expect(
      cancelMemberEventRegistration({ registrationId: OWN_REG }),
    ).resolves.toEqual({ status: "CANCELLATION_DEADLINE_PASSED" });
    expect(mocks.cancelRegistration).toHaveBeenCalledOnce();
  });

  it("cancels an owned registration with the signed-in user as actor", async () => {
    const result = await cancelMemberEventRegistration({
      registrationId: OWN_REG,
      reason: "schedule conflict",
      actorUserAccountId: OTHER_USER,
      isStaff: true,
      confirmationCode: "FORGED",
      email: "forged@church.test",
    } as { registrationId?: string; reason?: string });

    expect(result).toEqual({
      status: "CANCELLED",
      eventId: EVENT_ID,
      eventSlug: "sunday-worship",
      confirmationCode: CONFIRMATION_CODE,
    });
    expect(mocks.cancelRegistration).toHaveBeenCalledWith(
      {
        confirmationCode: CONFIRMATION_CODE,
        reason: "schedule conflict",
      },
      {
        userAccountId: USER_ID,
        email: OWN_EMAIL,
      },
    );
    expect(mocks.cancelRegistration.mock.calls[0]?.[2]).toBeUndefined();
  });

  it("treats an already cancelled owned registration as a safe success", async () => {
    mocks.cancelRegistration.mockResolvedValue({
      id: OWN_REG,
      eventId: EVENT_ID,
      confirmationCode: CONFIRMATION_CODE,
      status: "CANCELLED",
      cancellationReason: "already done",
    });
    await expect(
      cancelMemberEventRegistration({ registrationId: OWN_REG }),
    ).resolves.toEqual({
      status: "CANCELLED",
      eventId: EVENT_ID,
      eventSlug: "sunday-worship",
      confirmationCode: CONFIRMATION_CODE,
    });
    expect(mocks.cancelRegistration).toHaveBeenCalledOnce();
  });

  it("does not leak reason, attendee, or internal fields from the portal response", async () => {
    const result = await cancelMemberEventRegistration({
      registrationId: OWN_REG,
      reason: "schedule conflict",
    });
    const text = JSON.stringify(result);
    expect(text).not.toContain("schedule conflict");
    expect(text).not.toContain("changed plans");
    expect(text).not.toContain("Hidden");
    expect(text).not.toContain("Child");
    expect(text).not.toContain("staff only registration memo");
    expect(text).not.toMatch(/cancellationReason/);
    expect(text).not.toMatch(/primaryContactEmail/);
    expect(text).not.toMatch(/attendees/);
    expect(text).not.toMatch(/notes/);
    expect(Object.keys(result).sort()).toEqual([
      "confirmationCode",
      "eventId",
      "eventSlug",
      "status",
    ]);
  });

  it("rejects markup or oversized cancellation reasons before calling cancel", async () => {
    await expect(
      cancelMemberEventRegistration({
        registrationId: OWN_REG,
        reason: "<script>alert(1)</script>",
      }),
    ).resolves.toMatchObject({ status: "INVALID_REASON" });
    await expect(
      cancelMemberEventRegistration({
        registrationId: OWN_REG,
        reason: "x".repeat(501),
      }),
    ).resolves.toMatchObject({ status: "INVALID_REASON" });
    expect(store.lastFindWhere).toBeNull();
    expect(mocks.cancelRegistration).not.toHaveBeenCalled();
  });
});
