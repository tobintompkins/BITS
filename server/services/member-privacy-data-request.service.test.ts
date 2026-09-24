import { beforeEach, describe, expect, it, vi } from "vitest";

import { RoleCode } from "@/app/generated/prisma/client";
import { getPrivacyRequestCapabilitiesForRole } from "@/lib/auth/privacy-request-permissions";

type RequestRow = {
  id: string;
  organizationId: string;
  requestingUserAccountId: string;
  linkedDonorId: string | null;
  requestType: "DATA_COPY" | "CONTACT_CORRECTION" | "PRIVACY_QUESTION";
  memberNote: string | null;
  status: "OPEN" | "IN_REVIEW" | "COMPLETED" | "DECLINED";
  staffResolutionNote: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  resolvedByUserAccountId: string | null;
  requesterEmail: string;
  requesterName: string;
  donorFirstName?: string;
  donorLastName?: string;
};

type DonorRow = {
  id: string;
  organizationId: string;
  userAccountId: string;
  active: boolean;
  firstName: string;
  lastName: string;
};

const store = vi.hoisted(() => ({
  requests: [] as RequestRow[],
  donors: [] as DonorRow[],
  lastMemberFindWhere: null as unknown,
  lastStaffFindWhere: null as unknown,
  lastDuplicateWhere: null as unknown,
  lastDonorWhere: null as unknown,
  lastCreateData: null as unknown,
  lastUpdateWhere: null as unknown,
  lastUpdateData: null as unknown,
  donorQueried: false,
}));

const mocks = vi.hoisted(() => ({
  getOrCreateUserAccount: vi.fn(),
  findPrimaryOrganization: vi.fn(),
  getPrivacyRequestAccess: vi.fn(),
  createAuditEvent: vi.fn(async (input: Record<string, unknown>) => input),
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.getOrCreateUserAccount,
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findPrimaryOrganization: mocks.findPrimaryOrganization,
}));

vi.mock("@/lib/auth/privacy-request-permissions", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/auth/privacy-request-permissions")
  >("@/lib/auth/privacy-request-permissions");
  return {
    ...actual,
    getPrivacyRequestAccess: mocks.getPrivacyRequestAccess,
  };
});

vi.mock("@/server/repositories/audit-event.repository", () => ({
  createAuditEvent: mocks.createAuditEvent,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    donor: {
      findFirst: async ({
        where,
      }: {
        where: {
          organizationId: string;
          userAccountId: string;
          active: boolean;
        };
      }) => {
        store.donorQueried = true;
        store.lastDonorWhere = where;
        return (
          store.donors.find(
            (row) =>
              row.organizationId === where.organizationId &&
              row.userAccountId === where.userAccountId &&
              row.active === where.active,
          ) ?? null
        );
      },
    },
    memberPrivacyDataRequest: {
      findMany: async ({
        where,
        select,
      }: {
        where: {
          organizationId: string;
          requestingUserAccountId?: string;
        };
        select?: Record<string, unknown>;
      }) => {
        if (where.requestingUserAccountId) {
          store.lastMemberFindWhere = where;
        } else {
          store.lastStaffFindWhere = where;
        }
        return store.requests
          .filter((row) => {
            if (row.organizationId !== where.organizationId) return false;
            if (
              where.requestingUserAccountId &&
              row.requestingUserAccountId !== where.requestingUserAccountId
            ) {
              return false;
            }
            return true;
          })
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
          .map((row) =>
            select && "requestingUser" in (select ?? {})
              ? {
                  id: row.id,
                  requestType: row.requestType,
                  status: row.status,
                  memberNote: row.memberNote,
                  staffResolutionNote: row.staffResolutionNote,
                  createdAt: row.createdAt,
                  resolvedAt: row.resolvedAt,
                  requestingUser: {
                    displayName: row.requesterName,
                    primaryEmail: row.requesterEmail,
                  },
                  linkedDonor: row.linkedDonorId
                    ? {
                        firstName: row.donorFirstName,
                        lastName: row.donorLastName,
                      }
                    : null,
                }
              : {
                  requestType: row.requestType,
                  status: row.status,
                  createdAt: row.createdAt,
                  staffResolutionNote: row.staffResolutionNote,
                },
          );
      },
      findFirst: async ({
        where,
      }: {
        where: {
          id?: string;
          organizationId: string;
          requestingUserAccountId?: string;
          requestType?: string;
          status?: { in: string[] };
        };
      }) => {
        if (where.requestingUserAccountId && where.requestType) {
          store.lastDuplicateWhere = where;
        }
        const row = store.requests.find((item) => {
          if (item.organizationId !== where.organizationId) return false;
          if (where.id && item.id !== where.id) return false;
          if (
            where.requestingUserAccountId &&
            item.requestingUserAccountId !== where.requestingUserAccountId
          ) {
            return false;
          }
          if (where.requestType && item.requestType !== where.requestType) {
            return false;
          }
          if (where.status?.in && !where.status.in.includes(item.status)) {
            return false;
          }
          return true;
        });
        if (!row) return null;
        return {
          id: row.id,
          requestType: row.requestType,
          status: row.status,
        };
      },
      create: async ({
        data,
      }: {
        data: {
          organizationId: string;
          requestingUserAccountId: string;
          linkedDonorId: string | null;
          requestType: RequestRow["requestType"];
          memberNote: string | null;
          status: RequestRow["status"];
        };
      }) => {
        store.lastCreateData = data;
        const row: RequestRow = {
          id: "00000000-0000-4000-8000-00000000f100",
          createdAt: new Date("2026-09-24T15:00:00.000Z"),
          requesterEmail: "ann@church.test",
          requesterName: "Ann Adams",
          staffResolutionNote: null,
          resolvedAt: null,
          resolvedByUserAccountId: null,
          organizationId: data.organizationId,
          requestingUserAccountId: data.requestingUserAccountId,
          linkedDonorId: data.linkedDonorId,
          requestType: data.requestType,
          memberNote: data.memberNote,
          status: data.status,
        };
        store.requests.push(row);
        return {
          id: row.id,
          requestType: row.requestType,
          status: row.status,
        };
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<RequestRow>;
      }) => {
        store.lastUpdateWhere = where;
        store.lastUpdateData = data;
        const row = store.requests.find((item) => item.id === where.id);
        if (!row) return null;
        Object.assign(row, data);
        return row;
      },
    },
  },
}));

import {
  getMemberPrivacyDataRequests,
  listStaffPrivacyDataRequests,
  submitMemberPrivacyDataRequest,
  updateStaffPrivacyDataRequestStatus,
} from "./member-privacy-data-request.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const OTHER_USER = "00000000-0000-4000-8000-00000000c002";
const STAFF_ID = "00000000-0000-4000-8000-00000000c003";
const DONOR_ID = "00000000-0000-4000-8000-00000000d001";
const OTHER_DONOR = "00000000-0000-4000-8000-00000000d002";
const OWN_REQUEST = "00000000-0000-4000-8000-00000000f001";
const OTHER_USER_REQUEST = "00000000-0000-4000-8000-00000000f002";
const OTHER_ORG_REQUEST = "00000000-0000-4000-8000-00000000f003";
const SECRET_NOTE = "Please send my giving history to this private mailbox";

function request(
  overrides: Partial<RequestRow> & Pick<RequestRow, "id" | "requestType">,
): RequestRow {
  return {
    organizationId: ORG_ID,
    requestingUserAccountId: USER_ID,
    linkedDonorId: DONOR_ID,
    memberNote: SECRET_NOTE,
    status: "OPEN",
    staffResolutionNote: null,
    createdAt: new Date("2026-09-20T12:00:00.000Z"),
    resolvedAt: null,
    resolvedByUserAccountId: null,
    requesterEmail: "ann@church.test",
    requesterName: "Ann Adams",
    donorFirstName: "Ann",
    donorLastName: "Adams",
    ...overrides,
  };
}

function seed() {
  store.requests = [
    request({ id: OWN_REQUEST, requestType: "DATA_COPY" }),
    request({
      id: OTHER_USER_REQUEST,
      requestType: "PRIVACY_QUESTION",
      requestingUserAccountId: OTHER_USER,
      memberNote: "Other member private question",
      requesterEmail: "other@church.test",
      requesterName: "Other Person",
    }),
    request({
      id: OTHER_ORG_REQUEST,
      organizationId: OTHER_ORG,
      requestType: "CONTACT_CORRECTION",
      memberNote: "Other church note",
    }),
  ];
  store.donors = [
    {
      id: DONOR_ID,
      organizationId: ORG_ID,
      userAccountId: USER_ID,
      active: true,
      firstName: "Ann",
      lastName: "Adams",
    },
    {
      id: OTHER_DONOR,
      organizationId: ORG_ID,
      userAccountId: OTHER_USER,
      active: true,
      firstName: "Other",
      lastName: "Donor",
    },
  ];
  store.lastMemberFindWhere = null;
  store.lastStaffFindWhere = null;
  store.lastDuplicateWhere = null;
  store.lastDonorWhere = null;
  store.lastCreateData = null;
  store.lastUpdateWhere = null;
  store.lastUpdateData = null;
  store.donorQueried = false;
}

describe("member privacy data requests", () => {
  beforeEach(() => {
    seed();
    vi.clearAllMocks();
    mocks.getOrCreateUserAccount.mockResolvedValue({
      id: USER_ID,
      primaryEmail: "ann@church.test",
      displayName: "Ann Adams",
    });
    mocks.findPrimaryOrganization.mockResolvedValue({
      id: ORG_ID,
      name: "First United Pentecostal Church of Saco",
    });
    mocks.getPrivacyRequestAccess.mockResolvedValue(
      getPrivacyRequestCapabilitiesForRole(RoleCode.ORG_ADMIN, false, STAFF_ID),
    );
  });

  it("returns signed out without querying requests", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    await expect(getMemberPrivacyDataRequests()).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    expect(store.lastMemberFindWhere).toBeNull();
    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
  });

  it("scopes member history to the current organization and signed-in account", async () => {
    const result = await getMemberPrivacyDataRequests();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(store.lastMemberFindWhere).toEqual({
      organizationId: ORG_ID,
      requestingUserAccountId: USER_ID,
    });
    expect(result.requests).toEqual([
      {
        requestType: "DATA_COPY",
        status: "OPEN",
        createdAt: new Date("2026-09-20T12:00:00.000Z"),
        staffResolutionNote: null,
      },
    ]);
    const text = JSON.stringify(result);
    expect(text).not.toContain("Other member private question");
    expect(text).not.toContain("Other church note");
    expect(text).not.toContain(OTHER_USER);
    expect(text).not.toContain(SECRET_NOTE);
    expect(text).not.toContain(STAFF_ID);
    expect(text).not.toMatch(/requestingUserAccountId/);
    expect(text).not.toMatch(/linkedDonorId/);
  });

  it("resolves the signed-in account and linked donor on the server, ignoring client donor ids", async () => {
    store.requests = [];
    await expect(
      submitMemberPrivacyDataRequest({
        requestType: "CONTACT_CORRECTION",
        memberNote: "Please update my phone",
        donorId: OTHER_DONOR,
        requestingUserAccountId: OTHER_USER,
      }),
    ).resolves.toEqual({ status: "CREATED" });
    expect(store.lastDonorWhere).toEqual({
      organizationId: ORG_ID,
      userAccountId: USER_ID,
      active: true,
    });
    expect(store.lastCreateData).toMatchObject({
      organizationId: ORG_ID,
      requestingUserAccountId: USER_ID,
      linkedDonorId: DONOR_ID,
      requestType: "CONTACT_CORRECTION",
      memberNote: "Please update my phone",
      status: "OPEN",
    });
    expect(JSON.stringify(store.lastCreateData)).not.toContain(OTHER_DONOR);
    expect(JSON.stringify(store.lastCreateData)).not.toContain(OTHER_USER);
  });

  it("blocks a second open request of the same type", async () => {
    await expect(
      submitMemberPrivacyDataRequest({ requestType: "DATA_COPY" }),
    ).resolves.toEqual({ status: "DUPLICATE" });
    expect(store.lastCreateData).toBeNull();
    expect(store.lastDuplicateWhere).toEqual({
      organizationId: ORG_ID,
      requestingUserAccountId: USER_ID,
      requestType: "DATA_COPY",
      status: { in: ["OPEN", "IN_REVIEW"] },
    });
  });

  it("does not let a member see another account's request history", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue({
      id: OTHER_USER,
      primaryEmail: "other@church.test",
    });
    const result = await getMemberPrivacyDataRequests();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.requests.map((row) => row.requestType)).toEqual([
      "PRIVACY_QUESTION",
    ]);
    expect(JSON.stringify(result)).not.toContain(SECRET_NOTE);
    expect(JSON.stringify(result)).not.toContain("DATA_COPY");
  });

  it("denies staff review without the senior administration permission", async () => {
    mocks.getPrivacyRequestAccess.mockResolvedValue(
      getPrivacyRequestCapabilitiesForRole(RoleCode.TREASURER, false, STAFF_ID),
    );
    await expect(listStaffPrivacyDataRequests()).resolves.toEqual({
      status: "FORBIDDEN",
    });
    await expect(
      updateStaffPrivacyDataRequestStatus({
        requestId: OWN_REQUEST,
        status: "COMPLETED",
        staffResolutionNote: "Done",
      }),
    ).resolves.toEqual({ status: "FORBIDDEN" });
    expect(store.lastUpdateData).toBeNull();
    expect(store.lastStaffFindWhere).toBeNull();
  });

  it("lets permitted staff update a current-organization request", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue({
      id: STAFF_ID,
      primaryEmail: "admin@church.test",
    });
    await expect(
      updateStaffPrivacyDataRequestStatus({
        requestId: OWN_REQUEST,
        status: "COMPLETED",
        staffResolutionNote: "Copy prepared in office",
      }),
    ).resolves.toEqual({ status: "UPDATED" });
    expect(store.lastUpdateWhere).toEqual({ id: OWN_REQUEST });
    expect(store.lastUpdateData).toMatchObject({
      status: "COMPLETED",
      staffResolutionNote: "Copy prepared in office",
      resolvedByUserAccountId: STAFF_ID,
    });
  });

  it("does not update a request from another organization", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue({
      id: STAFF_ID,
      primaryEmail: "admin@church.test",
    });
    await expect(
      updateStaffPrivacyDataRequestStatus({
        requestId: OTHER_ORG_REQUEST,
        status: "DECLINED",
      }),
    ).resolves.toEqual({ status: "NOT_FOUND" });
    expect(store.lastUpdateData).toBeNull();
  });

  it("creates audit events without the member note text", async () => {
    store.requests = [];
    await submitMemberPrivacyDataRequest({
      requestType: "PRIVACY_QUESTION",
      memberNote: SECRET_NOTE,
    });
    expect(mocks.createAuditEvent).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      actorUserAccountId: USER_ID,
      action: "SUBMIT_PRIVACY_DATA_REQUEST",
      entityType: "MemberPrivacyDataRequest",
      entityId: "00000000-0000-4000-8000-00000000f100",
      changes: [
        { field: "action", oldValue: null, newValue: "SUBMIT_PRIVACY_DATA_REQUEST" },
        { field: "requestType", oldValue: null, newValue: "PRIVACY_QUESTION" },
        { field: "status", oldValue: null, newValue: "OPEN" },
      ],
    });
    expect(JSON.stringify(mocks.createAuditEvent.mock.calls)).not.toContain(
      SECRET_NOTE,
    );

    store.requests = [request({ id: OWN_REQUEST, requestType: "DATA_COPY" })];
    mocks.getOrCreateUserAccount.mockResolvedValue({
      id: STAFF_ID,
      primaryEmail: "admin@church.test",
    });
    await updateStaffPrivacyDataRequestStatus({
      requestId: OWN_REQUEST,
      status: "IN_REVIEW",
      staffResolutionNote: SECRET_NOTE,
    });
    const staffAudit = mocks.createAuditEvent.mock.calls.at(-1)?.[0] as {
      action: string;
      changes: Array<{ field: string }>;
    };
    expect(staffAudit.action).toBe("UPDATE_PRIVACY_DATA_REQUEST_STATUS");
    expect(JSON.stringify(staffAudit)).not.toContain(SECRET_NOTE);
    expect(staffAudit.changes.map((change) => change.field)).toEqual([
      "action",
      "requestType",
      "status",
    ]);
  });

  it("lists only current-organization requests for permitted staff", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue({
      id: STAFF_ID,
      primaryEmail: "admin@church.test",
    });
    const result = await listStaffPrivacyDataRequests();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(store.lastStaffFindWhere).toEqual({ organizationId: ORG_ID });
    expect(result.requests.map((row) => row.id)).toEqual([
      OWN_REQUEST,
      OTHER_USER_REQUEST,
    ]);
    expect(JSON.stringify(result)).not.toContain(OTHER_ORG_REQUEST);
    expect(JSON.stringify(result)).not.toContain("Other church note");
  });
});
