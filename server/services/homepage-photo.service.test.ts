import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), membership: vi.fn(), lock: vi.fn(), find: vi.fn(), save: vi.fn(), audit: vi.fn(), transaction: vi.fn(),
  publicOrg: vi.fn(), photo: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
  organizationMembership: { findFirst: mocks.membership }, homepagePhoto: { findUnique: mocks.photo },
  $transaction: mocks.transaction,
} }));
vi.mock("@/lib/batches/ledger-locks", () => ({ lockOrganizationForLedger: mocks.lock }));
vi.mock("@/server/repositories/audit-event.repository", () => ({ createAuditEvent: mocks.audit }));
vi.mock("@/server/repositories/public-organization.repository", () => ({ findPublicOrganization: mocks.publicOrg }));

import { homepagePhotoAdmin, publicHomepagePhoto, saveHomepagePhoto } from "./homepage-photo.service";

describe("homepage photo authorization and writes", () => {
  const grant = { organizationId: "church-a", userAccountId: "admin-a" };
  const tx = { organizationMembership: { findFirst: mocks.membership }, homepagePhoto: { findUnique: mocks.find, upsert: mocks.save } };
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("BITS_PUBLIC_ORGANIZATION_SLUG", "first-upc-of-saco");
    mocks.auth.mockResolvedValue({ userId: "clerk-admin" });
    mocks.membership.mockResolvedValue(grant);
    mocks.lock.mockResolvedValue({ id: "church-a" });
    mocks.find.mockResolvedValue(null);
    mocks.save.mockResolvedValue({ version: 1 });
    mocks.transaction.mockImplementation((fn) => fn(tx));
  });
  it("requires an active admin of the displayed public church", async () => {
    await homepagePhotoAdmin();
    expect(mocks.membership).toHaveBeenCalledWith(expect.objectContaining({ where: {
      active: true, organization: { slug: "first-upc-of-saco", active: true },
      userAccount: { clerkUserId: "clerk-admin", active: true }, roleType: { code: "ORG_ADMIN" },
    } }));
  });
  it("does not query memberships for a signed-out visitor", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    expect(await homepagePhotoAdmin()).toBeNull();
    expect(mocks.membership).not.toHaveBeenCalled();
  });
  it("denies non-admins before a transaction", async () => {
    mocks.membership.mockResolvedValue(null);
    await expect(saveHomepagePhoto({ image: new Uint8Array(1), alt: "Test", expectedVersion: 0 })).rejects.toMatchObject({ status: 403 });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("rechecks authorization after the church lock", async () => {
    mocks.membership.mockResolvedValueOnce(grant).mockResolvedValueOnce(null);
    await expect(saveHomepagePhoto({ image: new Uint8Array(1), alt: "Test", expectedVersion: 0 })).rejects.toMatchObject({ status: 403 });
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("rejects a stale replacement without writing or auditing", async () => {
    mocks.find.mockResolvedValue({ version: 2 });
    await expect(saveHomepagePhoto({ image: new Uint8Array(1), alt: "Test", expectedVersion: 1 })).rejects.toMatchObject({ status: 409 });
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("keeps the public page available when the database connection closes", async () => {
    mocks.publicOrg.mockRejectedValue(Object.assign(new Error("Server has closed the connection."), { code: "P1017" }));
    expect(await publicHomepagePhoto()).toBeNull();
    expect(mocks.photo).not.toHaveBeenCalled();
  });
  it("keeps the public page available when the photo lookup fails for any reason", async () => {
    mocks.publicOrg.mockRejectedValue(new Error("unexpected photo failure"));
    expect(await publicHomepagePhoto()).toBeNull();
  });
  it("keeps the public page available before the photo table exists", async () => {
    mocks.publicOrg.mockResolvedValue({ id: "church-a" });
    mocks.photo.mockRejectedValue(Object.assign(new Error("table missing"), { code: "P2021" }));
    expect(await publicHomepagePhoto()).toBeNull();
  });
  it("uses the transaction for both photo and audit, and propagates audit failure", async () => {
    mocks.audit.mockRejectedValue(new Error("audit unavailable"));
    await expect(saveHomepagePhoto({ image: new Uint8Array(1), alt: "Test", expectedVersion: 0 })).rejects.toThrow("audit unavailable");
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "church-a", actorUserAccountId: "admin-a" }), tx);
  });
});
