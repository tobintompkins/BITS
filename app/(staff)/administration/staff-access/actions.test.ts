import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateStaffMembership: vi.fn(),
  createStaffInvitation: vi.fn(),
  retryStaffInvitation: vi.fn(),
  revokeStaffInvitation: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/server/services/staff-membership-admin.service", () => ({
  updateStaffMembership: mocks.updateStaffMembership,
}));

vi.mock("@/server/services/staff-invitation.service", () => ({
  createStaffInvitation: mocks.createStaffInvitation,
  retryStaffInvitation: mocks.retryStaffInvitation,
  revokeStaffInvitation: mocks.revokeStaffInvitation,
}));

import {
  createStaffInvitationAction,
  updateStaffMembershipAction,
} from "./actions";

beforeEach(() => {
  mocks.updateStaffMembership.mockReset();
  mocks.revalidatePath.mockReset();
});

describe("updateStaffMembershipAction", () => {
  it("returns the service error without redirecting", async () => {
    mocks.updateStaffMembership.mockResolvedValue({
      ok: false,
      code: "UNAUTHORIZED",
      message: "You do not have permission to change staff memberships.",
    });
    const form = new FormData();
    form.set("membershipId", "00000000-0000-4000-8000-00000000b002");
    form.set("confirm", "on");
    await expect(
      updateStaffMembershipAction({ message: "" }, form),
    ).resolves.toEqual({
      message: "You do not have permission to change staff memberships.",
      ok: false,
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("revalidates authorized views after a real change", async () => {
    mocks.updateStaffMembership.mockResolvedValue({
      ok: true,
      changed: true,
      membershipId: "00000000-0000-4000-8000-00000000b002",
      version: 2,
      action: "STAFF_MEMBERSHIP_ROLE_CHANGED",
    });
    const form = new FormData();
    await expect(
      updateStaffMembershipAction({ message: "" }, form),
    ).resolves.toEqual({
      message: "Staff membership updated.",
      ok: true,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/administration/staff-access");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
  });
});

describe("createStaffInvitationAction", () => {
  it("returns a provider-failed invitation without claiming email delivery", async () => {
    mocks.createStaffInvitation.mockResolvedValue({
      ok: true,
      invitationId: "00000000-0000-4000-8000-00000000e001",
      status: "FAILED",
      version: 2,
      action: "STAFF_INVITATION_FAILED",
    });
    const form = new FormData();
    form.set("email", "pat@example.test");
    form.set("roleCode", "TREASURER");
    form.set("confirm", "on");
    await expect(
      createStaffInvitationAction({ message: "" }, form),
    ).resolves.toEqual({
      message:
        "Invitation authorized, but the provider did not accept it as sent.",
      ok: true,
    });
  });
});
