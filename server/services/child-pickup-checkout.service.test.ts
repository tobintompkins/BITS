import { beforeEach, describe, expect, it, vi } from "vitest";

import { CheckInError } from "@/lib/errors/check-in-errors";
import {
  CHILD_PICKUP_APPROVAL_DTO_FIELDS,
  CHILD_PICKUP_FORBIDDEN_DTO_FIELDS,
  CHILD_PICKUP_SEARCH_DTO_FIELDS,
  CHILD_PICKUP_VERIFIED_AUDIT_ACTION,
  canAccessVerifiedChildCheckOut,
  childPickupAuditContainsPersonalData,
} from "@/lib/validation/child-pickup-checkout";

type AttendanceRow = {
  id: string;
  organizationId: string;
  eventId: string;
  status: string;
  attendeeId: string | null;
  memberId: string | null;
  attendee: {
    id: string;
    memberId: string | null;
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    guardianName?: string;
  } | null;
};

type PickupRow = {
  id: string;
  organizationId: string;
  memberId: string;
  firstName: string;
  lastName: string;
  relationship: string;
  isActive: boolean;
};

type VerificationRow = {
  id: string;
  organizationId: string;
  eventId: string;
  attendanceId: string;
  memberId: string;
  approvedPickupId: string;
};

const store = vi.hoisted(() => ({
  event: null as { id: string; title: string; checkInSettings: { allowCheckOut: boolean } } | null,
  attendance: [] as AttendanceRow[],
  pickups: [] as PickupRow[],
  verifications: [] as VerificationRow[],
  actions: [] as Array<{ attendanceId: string; action: string }>,
  searchCalls: 0,
  pickupListCalls: 0,
  verificationCreates: 0,
  checkoutCalls: 0,
  lastSearchWhere: null as unknown,
}));

const mocks = vi.hoisted(() => ({
  getOrCreateUserAccount: vi.fn(),
  findPrimaryOrganization: vi.fn(),
  getMemberAccess: vi.fn(),
  getEventAccess: vi.fn(),
  createAuditEvent: vi.fn(async (input: Record<string, unknown>) => input),
  audits: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.getOrCreateUserAccount,
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findPrimaryOrganization: mocks.findPrimaryOrganization,
}));

vi.mock("@/lib/auth/member-permissions", () => ({
  getMemberAccess: mocks.getMemberAccess,
}));

vi.mock("@/lib/auth/event-permissions", () => ({
  getEventAccess: mocks.getEventAccess,
}));

vi.mock("@/server/repositories/audit-event.repository", () => ({
  createAuditEvent: async (input: Record<string, unknown>) => {
    mocks.audits.push(input);
    return mocks.createAuditEvent(input);
  },
}));

vi.mock("@/server/repositories/event-attendance.repository", () => ({
  lockAttendanceForEventAttendee: vi.fn(async () => undefined),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: Record<string, never>) => Promise<unknown>) =>
      fn({}),
  },
}));

vi.mock("@/server/repositories/child-pickup-checkout.repository", () => ({
  findEventForChildPickup: async (_organizationId: string, eventId: string) => {
    if (!store.event || store.event.id !== eventId) return null;
    return store.event;
  },
  searchPresentMemberLinkedAttendance: async (input: {
    organizationId: string;
    eventId: string;
    query: string;
  }) => {
    store.searchCalls += 1;
    store.lastSearchWhere = input;
    return store.attendance.filter((row) => {
      if (row.organizationId !== input.organizationId) return false;
      if (row.eventId !== input.eventId) return false;
      if (row.status !== "PRESENT") return false;
      if (!row.attendee?.memberId) return false;
      const q = input.query.toLowerCase();
      return (
        row.attendee.firstName.toLowerCase().includes(q) ||
        row.attendee.lastName.toLowerCase().includes(q)
      );
    });
  },
  findPresentAttendanceForChildPickup: async (
    organizationId: string,
    eventId: string,
    attendanceId: string,
  ) => {
    return (
      store.attendance.find(
        (row) =>
          row.id === attendanceId &&
          row.organizationId === organizationId &&
          row.eventId === eventId,
      ) ?? null
    );
  },
  findActiveApprovedPickupsForMember: async (
    organizationId: string,
    memberId: string,
  ) => {
    store.pickupListCalls += 1;
    return store.pickups.filter(
      (row) =>
        row.organizationId === organizationId &&
        row.memberId === memberId &&
        row.isActive,
    );
  },
  findActiveApprovedPickupForMember: async (
    organizationId: string,
    memberId: string,
    pickupId: string,
  ) => {
    return (
      store.pickups.find(
        (row) =>
          row.id === pickupId &&
          row.organizationId === organizationId &&
          row.memberId === memberId &&
          row.isActive,
      ) ?? null
    );
  },
  findChildPickupVerificationByAttendance: async (
    organizationId: string,
    attendanceId: string,
  ) => {
    return (
      store.verifications.find(
        (row) =>
          row.organizationId === organizationId &&
          row.attendanceId === attendanceId,
      ) ?? null
    );
  },
  createChildPickupVerification: async (data: {
    organizationId: string;
    eventId: string;
    attendanceId: string;
    memberId: string;
    approvedPickupId: string;
  }) => {
    if (store.verifications.some((row) => row.attendanceId === data.attendanceId)) {
      throw { code: "P2002" };
    }
    store.verificationCreates += 1;
    const created = {
      id: "00000000-0000-4000-8000-00000000aa04",
      organizationId: data.organizationId,
      eventId: data.eventId,
      attendanceId: data.attendanceId,
      memberId: data.memberId,
      approvedPickupId: data.approvedPickupId,
    };
    store.verifications.push(created);
    return { id: created.id, attendanceId: created.attendanceId };
  },
}));

vi.mock("@/server/services/event-check-in.service", () => ({
  applyAttendanceCheckOutInTransaction: async (
    _eventId: string,
    attendanceId: string,
  ) => {
    store.checkoutCalls += 1;
    const row = store.attendance.find((item) => item.id === attendanceId);
    if (!row) throw new CheckInError("NOT_FOUND", "Attendance record not found.");
    if (row.status === "CHECKED_OUT") {
      return { attendance: row, alreadyCheckedOut: true };
    }
    if (row.status !== "PRESENT") {
      throw new CheckInError("VALIDATION", "Only present attendees can check out.");
    }
    row.status = "CHECKED_OUT";
    store.actions.push({ attendanceId, action: "CHECKED_OUT" });
    return { attendance: row, alreadyCheckedOut: false };
  },
}));

import {
  confirmVerifiedChildCheckOut,
  getVerifiedChildCheckOutPage,
  listActiveApprovalsForCheckedInChild,
  searchVerifiedChildCheckOut,
} from "./child-pickup-checkout.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const EVENT_ID = "00000000-0000-4000-8000-00000000e001";
const OTHER_EVENT = "00000000-0000-4000-8000-00000000e002";
const ATTENDANCE_ID = "00000000-0000-4000-8000-00000000d001";
const ATTENDEE_ID = "00000000-0000-4000-8000-00000000f001";
const MEMBER_ID = "00000000-0000-4000-8000-00000000b001";
const PICKUP_ID = "00000000-0000-4000-8000-00000000aa01";
const INACTIVE_PICKUP_ID = "00000000-0000-4000-8000-00000000aa02";
const OTHER_MEMBER_PICKUP_ID = "00000000-0000-4000-8000-00000000aa03";

function fullAccess() {
  mocks.getMemberAccess.mockResolvedValue({ canView: true, canEdit: true });
  mocks.getEventAccess.mockResolvedValue({ canManageCheckIn: true });
}

function presentChild(overrides: Partial<AttendanceRow> = {}): AttendanceRow {
  return {
    id: ATTENDANCE_ID,
    organizationId: ORG_ID,
    eventId: EVENT_ID,
    status: "PRESENT",
    attendeeId: ATTENDEE_ID,
    memberId: MEMBER_ID,
    attendee: {
      id: ATTENDEE_ID,
      memberId: MEMBER_ID,
      firstName: "Jordan",
      lastName: "Hayes",
      email: "jordan@example.com",
      phone: "555-0100",
      guardianName: "Alex Hayes",
    },
    ...overrides,
  };
}

function activePickup(overrides: Partial<PickupRow> = {}): PickupRow {
  return {
    id: PICKUP_ID,
    organizationId: ORG_ID,
    memberId: MEMBER_ID,
    firstName: "Casey",
    lastName: "Nguyen",
    relationship: "Grandparent",
    isActive: true,
    ...overrides,
  };
}

describe("canAccessVerifiedChildCheckOut", () => {
  it("requires member view, member edit, and check-in management together", () => {
    expect(
      canAccessVerifiedChildCheckOut({
        canViewMembers: true,
        canEditMembers: true,
        canManageCheckIn: true,
      }),
    ).toBe(true);
    expect(
      canAccessVerifiedChildCheckOut({
        canViewMembers: true,
        canEditMembers: false,
        canManageCheckIn: true,
      }),
    ).toBe(false);
    expect(
      canAccessVerifiedChildCheckOut({
        canViewMembers: true,
        canEditMembers: true,
        canManageCheckIn: false,
      }),
    ).toBe(false);
    expect(
      canAccessVerifiedChildCheckOut({
        canViewMembers: false,
        canEditMembers: true,
        canManageCheckIn: true,
      }),
    ).toBe(false);
  });
});

describe("verified child pickup check-out service", () => {
  beforeEach(() => {
    store.event = {
      id: EVENT_ID,
      title: "Children's ministry",
      checkInSettings: { allowCheckOut: true },
    };
    store.attendance = [presentChild()];
    store.pickups = [activePickup()];
    store.verifications = [];
    store.actions = [];
    store.searchCalls = 0;
    store.pickupListCalls = 0;
    store.verificationCreates = 0;
    store.checkoutCalls = 0;
    store.lastSearchWhere = null;
    mocks.audits = [];
    mocks.getOrCreateUserAccount.mockReset();
    mocks.findPrimaryOrganization.mockReset();
    mocks.getMemberAccess.mockReset();
    mocks.getEventAccess.mockReset();
    mocks.createAuditEvent.mockClear();
    mocks.getOrCreateUserAccount.mockResolvedValue({ id: USER_ID });
    mocks.findPrimaryOrganization.mockResolvedValue({ id: ORG_ID });
    fullAccess();
  });

  it("requires all three permissions for every operation", async () => {
    mocks.getMemberAccess.mockResolvedValue({ canView: true, canEdit: false });
    await expect(getVerifiedChildCheckOutPage(EVENT_ID)).resolves.toEqual({
      status: "UNAUTHORIZED",
    });
    await expect(searchVerifiedChildCheckOut(EVENT_ID, "Jo")).resolves.toEqual({
      status: "UNAUTHORIZED",
    });
    await expect(
      listActiveApprovalsForCheckedInChild(EVENT_ID, ATTENDANCE_ID),
    ).resolves.toEqual({ status: "UNAUTHORIZED" });
    await expect(
      confirmVerifiedChildCheckOut({
        eventId: EVENT_ID,
        attendanceId: ATTENDANCE_ID,
        approvedPickupId: PICKUP_ID,
      }),
    ).resolves.toEqual({ status: "UNAUTHORIZED" });
    expect(store.searchCalls).toBe(0);
    expect(store.pickupListCalls).toBe(0);
    expect(store.checkoutCalls).toBe(0);
  });

  it("treats check-in-only access as insufficient", async () => {
    mocks.getMemberAccess.mockResolvedValue({ canView: false, canEdit: false });
    mocks.getEventAccess.mockResolvedValue({ canManageCheckIn: true });
    await expect(searchVerifiedChildCheckOut(EVENT_ID, "Jo")).resolves.toEqual({
      status: "UNAUTHORIZED",
    });
  });

  it("searches only currently present member-linked attendees with a safe DTO", async () => {
    store.attendance = [
      presentChild(),
      presentChild({
        id: "00000000-0000-4000-8000-00000000d002",
        status: "CHECKED_OUT",
        attendee: {
          id: "00000000-0000-4000-8000-00000000f002",
          memberId: MEMBER_ID,
          firstName: "Jordan",
          lastName: "West",
        },
      }),
      presentChild({
        id: "00000000-0000-4000-8000-00000000d003",
        attendeeId: "00000000-0000-4000-8000-00000000f003",
        memberId: null,
        attendee: {
          id: "00000000-0000-4000-8000-00000000f003",
          memberId: null,
          firstName: "Jordan",
          lastName: "Guest",
        },
      }),
      presentChild({
        id: "00000000-0000-4000-8000-00000000d004",
        organizationId: OTHER_ORG,
        attendee: {
          id: "00000000-0000-4000-8000-00000000f004",
          memberId: MEMBER_ID,
          firstName: "Jordan",
          lastName: "Other",
        },
      }),
    ];

    const result = await searchVerifiedChildCheckOut(EVENT_ID, "Jo");
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.rows).toHaveLength(1);
    expect(Object.keys(result.rows[0]).sort()).toEqual(
      [...CHILD_PICKUP_SEARCH_DTO_FIELDS].sort(),
    );
    expect(result.rows[0].displayLabel).toBe("Jordan H.");
    for (const field of CHILD_PICKUP_FORBIDDEN_DTO_FIELDS) {
      expect(result.rows[0]).not.toHaveProperty(field);
    }
    expect(store.lastSearchWhere).toMatchObject({
      organizationId: ORG_ID,
      eventId: EVENT_ID,
    });
  });

  it("returns only that child's active approvals after selection", async () => {
    store.pickups = [
      activePickup(),
      activePickup({
        id: INACTIVE_PICKUP_ID,
        firstName: "Riley",
        lastName: "Stone",
        relationship: "Family Friend",
        isActive: false,
      }),
      activePickup({
        id: OTHER_MEMBER_PICKUP_ID,
        memberId: "00000000-0000-4000-8000-00000000b009",
        firstName: "Morgan",
        lastName: "Lee",
        relationship: "Parent",
      }),
    ];

    const result = await listActiveApprovalsForCheckedInChild(
      EVENT_ID,
      ATTENDANCE_ID,
    );
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual({
      id: PICKUP_ID,
      firstName: "Casey",
      lastName: "Nguyen",
      relationship: "Grandparent",
    });
    expect(Object.keys(result.rows[0]).sort()).toEqual(
      [...CHILD_PICKUP_APPROVAL_DTO_FIELDS].sort(),
    );
    for (const field of CHILD_PICKUP_FORBIDDEN_DTO_FIELDS) {
      expect(result.rows[0]).not.toHaveProperty(field);
    }
  });

  it("rejects inactive approvals, other organizations, other events, and non-present attendees", async () => {
    store.pickups = [
      activePickup({ id: INACTIVE_PICKUP_ID, isActive: false }),
    ];
    await expect(
      confirmVerifiedChildCheckOut({
        eventId: EVENT_ID,
        attendanceId: ATTENDANCE_ID,
        approvedPickupId: INACTIVE_PICKUP_ID,
      }),
    ).resolves.toEqual({ status: "NO_APPROVALS" });

    store.pickups = [activePickup()];
    store.attendance = [
      presentChild({ organizationId: OTHER_ORG, eventId: OTHER_EVENT }),
    ];
    await expect(
      listActiveApprovalsForCheckedInChild(EVENT_ID, ATTENDANCE_ID),
    ).resolves.toEqual({ status: "NOT_FOUND" });
    await expect(
      confirmVerifiedChildCheckOut({
        eventId: EVENT_ID,
        attendanceId: ATTENDANCE_ID,
        approvedPickupId: PICKUP_ID,
      }),
    ).resolves.toEqual({ status: "NOT_FOUND" });

    store.attendance = [presentChild({ eventId: OTHER_EVENT })];
    await expect(
      confirmVerifiedChildCheckOut({
        eventId: EVENT_ID,
        attendanceId: ATTENDANCE_ID,
        approvedPickupId: PICKUP_ID,
      }),
    ).resolves.toEqual({ status: "NOT_FOUND" });

    store.attendance = [presentChild({ status: "EXPECTED" })];
    await expect(
      confirmVerifiedChildCheckOut({
        eventId: EVENT_ID,
        attendanceId: ATTENDANCE_ID,
        approvedPickupId: PICKUP_ID,
      }),
    ).resolves.toEqual({ status: "NOT_PRESENT" });

    store.attendance = [presentChild()];
    store.pickups = [activePickup()];
    await expect(
      confirmVerifiedChildCheckOut({
        eventId: EVENT_ID,
        attendanceId: ATTENDANCE_ID,
        approvedPickupId: OTHER_MEMBER_PICKUP_ID,
      }),
    ).resolves.toEqual({ status: "APPROVAL_MISMATCH" });
  });

  it("does not check out when the child has no active approved pickup person", async () => {
    store.pickups = [];
    const listed = await listActiveApprovalsForCheckedInChild(
      EVENT_ID,
      ATTENDANCE_ID,
    );
    expect(listed.status).toBe("NO_APPROVALS");
    await expect(
      confirmVerifiedChildCheckOut({
        eventId: EVENT_ID,
        attendanceId: ATTENDANCE_ID,
        approvedPickupId: PICKUP_ID,
      }),
    ).resolves.toEqual({ status: "NO_APPROVALS" });
    expect(store.checkoutCalls).toBe(0);
    expect(store.verificationCreates).toBe(0);
  });

  it("creates one verification, keeps the normal check-out action, and redacts the audit payload", async () => {
    const result = await confirmVerifiedChildCheckOut({
      eventId: EVENT_ID,
      attendanceId: ATTENDANCE_ID,
      approvedPickupId: PICKUP_ID,
    });
    expect(result).toEqual({
      status: "CHECKED_OUT",
      displayLabel: "Jordan H.",
      alreadyCompleted: false,
    });
    expect(store.verifications).toHaveLength(1);
    expect(store.actions).toEqual([
      { attendanceId: ATTENDANCE_ID, action: "CHECKED_OUT" },
    ]);
    expect(store.attendance[0].status).toBe("CHECKED_OUT");

    const actions = mocks.audits.map((entry) => entry.action);
    expect(actions).toContain("EVENT_ATTENDEE_CHECKED_OUT");
    expect(actions).toContain(CHILD_PICKUP_VERIFIED_AUDIT_ACTION);

    for (const audit of mocks.audits) {
      expect(
        childPickupAuditContainsPersonalData(audit, [
          "Jordan",
          "Hayes",
          "Casey",
          "Nguyen",
          "Grandparent",
          "jordan@example.com",
          "Alex Hayes",
        ]),
      ).toBe(false);
    }
  });

  it("is idempotent on repeat confirm and cannot create duplicate verification or check-out records", async () => {
    await confirmVerifiedChildCheckOut({
      eventId: EVENT_ID,
      attendanceId: ATTENDANCE_ID,
      approvedPickupId: PICKUP_ID,
    });
    const second = await confirmVerifiedChildCheckOut({
      eventId: EVENT_ID,
      attendanceId: ATTENDANCE_ID,
      approvedPickupId: PICKUP_ID,
    });
    expect(second.status).toBe("CHECKED_OUT");
    if (second.status !== "CHECKED_OUT") return;
    expect(second.alreadyCompleted).toBe(true);
    expect(store.verifications).toHaveLength(1);
    expect(store.actions.filter((row) => row.action === "CHECKED_OUT")).toHaveLength(
      1,
    );
    expect(
      mocks.audits.filter((entry) => entry.action === CHILD_PICKUP_VERIFIED_AUDIT_ACTION),
    ).toHaveLength(1);
  });
});
