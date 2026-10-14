import { afterEach, describe, expect, it } from "vitest";

import {
  createMockStaffInvitationProvider,
  createMockStaffInvitationStore,
  resetDefaultMockStaffInvitationStore,
} from "./staff-invitation-provider";

describe("mock staff invitation provider", () => {
  afterEach(() => {
    resetDefaultMockStaffInvitationStore();
  });

  it("records a create without contacting a network", async () => {
    const store = createMockStaffInvitationStore();
    const provider = createMockStaffInvitationProvider(store);
    const created = await provider.createOrganizationInvitation({
      clerkOrganizationId: "org_test",
      emailAddress: "pat@example.test",
      redirectUrl: "https://app.example.test/staff-invitations/accept?intent=abc",
      expiresInDays: 14,
      bitsInvitationId: "00000000-0000-4000-8000-00000000e001",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.providerInvitationId).toMatch(/^orginv_mock_/);
    expect(store.invitations.size).toBe(1);
  });

  it("reports timeout and error without claiming sent", async () => {
    const store = createMockStaffInvitationStore();
    store.createBehavior = "timeout";
    const provider = createMockStaffInvitationProvider(store);
    await expect(
      provider.createOrganizationInvitation({
        clerkOrganizationId: "org_test",
        emailAddress: "pat@example.test",
        redirectUrl: "https://app.example.test/accept",
        expiresInDays: 14,
        bitsInvitationId: "00000000-0000-4000-8000-00000000e001",
      }),
    ).resolves.toMatchObject({ ok: false, kind: "timeout" });

    store.createBehavior = "error";
    await expect(
      provider.createOrganizationInvitation({
        clerkOrganizationId: "org_test",
        emailAddress: "pat@example.test",
        redirectUrl: "https://app.example.test/accept",
        expiresInDays: 14,
        bitsInvitationId: "00000000-0000-4000-8000-00000000e001",
      }),
    ).resolves.toMatchObject({ ok: false, kind: "error" });
  });
});
