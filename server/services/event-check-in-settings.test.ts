import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findPrimaryOrganization: vi.fn(),
  requireEventPermission: vi.fn(),
  findEventForCheckIn: vi.fn(),
  findCheckInSettings: vi.fn(),
  upsertCheckInSettings: vi.fn(),
  createAuditEvent: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findPrimaryOrganization: mocks.findPrimaryOrganization,
}));

vi.mock("@/lib/auth/event-permissions", () => ({
  getEventAccess: vi.fn(),
  requireEventPermission: mocks.requireEventPermission,
}));

vi.mock("@/server/repositories/event-check-in.repository", () => ({
  findCheckInSettings: mocks.findCheckInSettings,
  findEventForCheckIn: mocks.findEventForCheckIn,
  upsertCheckInSettings: mocks.upsertCheckInSettings,
  prisma: {
    eventRegistrationSettings: {
      updateMany: mocks.updateMany,
    },
  },
  closeStationRecord: vi.fn(),
  findActiveQrPassByFallback: vi.fn(),
  findActiveQrPassByHash: vi.fn(),
  findActiveStation: vi.fn(),
  findAttendanceById: vi.fn(),
  getAttendanceSummaryCounts: vi.fn(),
  listAttendanceRecords: vi.fn(),
  listStations: vi.fn(),
  lockCheckInSettingsForEvent: vi.fn(),
  openStationRecord: vi.fn(),
  searchEligibleAttendees: vi.fn(),
}));

vi.mock("@/server/repositories/audit-event.repository", () => ({
  createAuditEvent: mocks.createAuditEvent,
}));

vi.mock("@/server/repositories/event-registration.repository", () => ({
  countCapacityUsed: vi.fn(),
  createMemberAttendanceForCheckIn: vi.fn(),
  lockRegistrationSettingsForEvent: vi.fn(),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  assertActionAllowed: vi.fn(),
}));

import { CheckInError } from "@/lib/errors/check-in-errors";
import {
  getCheckInSettingsDto,
  updateCheckInSettings,
} from "@/server/services/event-check-in.service";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const EVENT_A = "22222222-2222-4222-8222-222222222222";
const EVENT_B = "33333333-3333-4333-8333-333333333333";
const SETTINGS_ID = "44444444-4444-4444-8444-444444444444";

const actor = { userAccountId: "user-1", email: "manager@example.com" };

function settingsInput(
  overrides: Partial<{
    eventId: string;
    checkInEnabled: boolean;
    checkInOpensAt: string | undefined;
    checkInClosesAt: string | undefined;
    allowSelfCheckIn: boolean;
    allowWalkIns: boolean;
    allowCheckOut: boolean;
    allowReentry: boolean;
    requireRegistration: boolean;
    qrPassEnabled: boolean;
    stationNameRequired: boolean;
  }> = {},
) {
  return {
    eventId: EVENT_A,
    checkInEnabled: false,
    checkInOpensAt: undefined,
    checkInClosesAt: undefined,
    allowSelfCheckIn: false,
    allowWalkIns: false,
    allowCheckOut: false,
    allowReentry: false,
    requireRegistration: true,
    qrPassEnabled: true,
    stationNameRequired: false,
    ...overrides,
  };
}

function defaultSettings(overrides: Record<string, unknown> = {}) {
  return {
    id: SETTINGS_ID,
    organizationId: ORG_A,
    eventId: EVENT_A,
    checkInEnabled: false,
    checkInOpensAt: null,
    checkInClosesAt: null,
    allowSelfCheckIn: false,
    allowWalkIns: false,
    allowCheckOut: false,
    allowReentry: false,
    requireRegistration: true,
    qrPassEnabled: true,
    stationNameRequired: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findPrimaryOrganization.mockResolvedValue({ id: ORG_A });
  mocks.requireEventPermission.mockResolvedValue({
    canManageCheckIn: true,
    canReadCheckIn: true,
    userAccountId: actor.userAccountId,
  });
  mocks.findEventForCheckIn.mockImplementation(
    async (organizationId: string, eventId: string) => {
      if (organizationId !== ORG_A) return null;
      if (eventId !== EVENT_A) return null;
      return {
        id: EVENT_A,
        organizationId: ORG_A,
        title: "Sunday Service",
        timezone: "America/Chicago",
      };
    },
  );
  mocks.findCheckInSettings.mockResolvedValue(defaultSettings());
  mocks.upsertCheckInSettings.mockImplementation(
    async (_org: string, eventId: string, data: Record<string, unknown>) =>
      defaultSettings({ eventId, ...data }),
  );
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.createAuditEvent.mockResolvedValue({ id: "audit-1" });
});

describe("Blueprint 7.3A check-in settings service", () => {
  it("defaults keep check-in disabled on read bootstrap", async () => {
    mocks.findCheckInSettings.mockResolvedValueOnce(null);
    mocks.upsertCheckInSettings.mockResolvedValueOnce(defaultSettings());

    const dto = await getCheckInSettingsDto(EVENT_A);

    expect(dto.settings.checkInEnabled).toBe(false);
    expect(dto.settings.requireRegistration).toBe(true);
    expect(mocks.upsertCheckInSettings).toHaveBeenCalledWith(
      ORG_A,
      EVENT_A,
      expect.objectContaining({ checkInEnabled: false }),
    );
  });

  it("allows a permitted manager to update same-tenant settings and audits material changes", async () => {
    const result = await updateCheckInSettings(
      settingsInput({
        checkInEnabled: true,
        checkInOpensAt: "2026-08-10T09:00",
        checkInClosesAt: "2026-08-10T12:00",
        allowSelfCheckIn: true,
        allowCheckOut: true,
        allowReentry: true,
      }),
      actor,
    );

    expect(result.checkInEnabled).toBe(true);
    expect(mocks.requireEventPermission).toHaveBeenCalledWith(
      ORG_A,
      expect.any(Function),
      "You do not have permission to manage check-in settings.",
    );
    expect(mocks.findEventForCheckIn).toHaveBeenCalledWith(ORG_A, EVENT_A);
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_A,
        action: "EVENT_CHECK_IN_SETTINGS_UPDATED",
        entityType: "EventCheckInSettings",
        entityId: SETTINGS_ID,
        changes: expect.arrayContaining([
          expect.objectContaining({
            field: "checkInEnabled",
            oldValue: "false",
            newValue: "true",
          }),
        ]),
      }),
    );
  });

  it("does not create an audit entry when nothing material changed", async () => {
    await updateCheckInSettings(settingsInput(), actor);

    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects unauthorized managers before persistence", async () => {
    mocks.requireEventPermission.mockRejectedValueOnce(
      new Error("You do not have permission to manage check-in settings."),
    );

    await expect(
      updateCheckInSettings(settingsInput({ checkInEnabled: true }), actor),
    ).rejects.toThrow("You do not have permission to manage check-in settings.");

    expect(mocks.upsertCheckInSettings).not.toHaveBeenCalled();
    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
  });

  it("returns not-found for cross-tenant or unknown event IDs without revealing existence", async () => {
    await expect(
      updateCheckInSettings(
        settingsInput({ eventId: EVENT_B, checkInEnabled: true }),
        actor,
      ),
    ).rejects.toMatchObject({
      code: "EVENT_NOT_FOUND",
      message: "Event not found.",
    } satisfies Partial<CheckInError>);

    expect(mocks.findEventForCheckIn).toHaveBeenCalledWith(ORG_A, EVENT_B);
    expect(mocks.upsertCheckInSettings).not.toHaveBeenCalled();
    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects invalid boolean invariants without auditing", async () => {
    await expect(
      updateCheckInSettings(
        settingsInput({ checkInEnabled: false, allowSelfCheckIn: true }),
        actor,
      ),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      message: "Self check-in requires check-in to be enabled.",
    });

    expect(mocks.upsertCheckInSettings).not.toHaveBeenCalled();
    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects close-before-open without auditing", async () => {
    await expect(
      updateCheckInSettings(
        settingsInput({
          checkInEnabled: true,
          checkInOpensAt: "2026-08-10T12:00",
          checkInClosesAt: "2026-08-10T09:00",
        }),
        actor,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
  });
});
