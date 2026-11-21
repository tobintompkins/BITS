import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), membership: vi.fn(), lock: vi.fn(), audit: vi.fn(), transaction: vi.fn(),
  publicOrg: vi.fn(), list: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), remove: vi.fn(), update: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {
  organizationMembership: { findFirst: mocks.membership },
  homepageSlideshowPhoto: {
    findMany: mocks.list, findFirst: mocks.findFirst, count: mocks.count, create: mocks.create, delete: mocks.remove, update: mocks.update,
  },
  $transaction: mocks.transaction,
} }));
vi.mock("@/lib/batches/ledger-locks", () => ({ lockOrganizationForLedger: mocks.lock }));
vi.mock("@/server/repositories/audit-event.repository", () => ({ createAuditEvent: mocks.audit }));
vi.mock("@/server/repositories/public-organization.repository", () => ({ findPublicOrganization: mocks.publicOrg }));

import {
  addHomepageSlideshowPhoto,
  publicHomepageSlideshow,
  removeHomepageSlideshowPhoto,
  reorderHomepageSlideshow,
} from "./homepage-slideshow.service";

const photoId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";

describe("homepage slideshow authorization", () => {
  const grant = { organizationId: "church-a", userAccountId: "admin-a" };
  const tx = {
    organizationMembership: { findFirst: mocks.membership },
    homepageSlideshowPhoto: {
      findMany: mocks.list, findFirst: mocks.findFirst, count: mocks.count, create: mocks.create, delete: mocks.remove, update: mocks.update,
    },
  };
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("BITS_PUBLIC_ORGANIZATION_SLUG", "first-upc-of-saco");
    mocks.auth.mockResolvedValue({ userId: "clerk-admin" });
    mocks.membership.mockResolvedValue(grant);
    mocks.lock.mockResolvedValue({ id: "church-a" });
    mocks.count.mockResolvedValue(0);
    mocks.findFirst.mockResolvedValue(null);
    mocks.list.mockResolvedValue([]);
    mocks.create.mockResolvedValue({ id: photoId, alt: "Sunday worship", sortOrder: 0 });
    mocks.transaction.mockImplementation((fn) => fn(tx));
  });

  it("denies a signed-out visitor before opening a transaction", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    await expect(addHomepageSlideshowPhoto({ image: new Uint8Array(1), alt: "Sunday worship" })).rejects.toMatchObject({ status: 403 });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("denies someone who is not an administrator of this church", async () => {
    mocks.membership.mockResolvedValue(null);
    await expect(removeHomepageSlideshowPhoto(photoId)).rejects.toMatchObject({ status: 403 });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not remove a photo that belongs to another church", async () => {
    mocks.findFirst.mockResolvedValue(null);
    await expect(removeHomepageSlideshowPhoto(photoId)).rejects.toMatchObject({ status: 404 });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("rejects a reorder that includes a photo from outside this slideshow", async () => {
    mocks.list.mockResolvedValue([{ id: photoId }]);
    await expect(reorderHomepageSlideshow([photoId, otherId])).rejects.toMatchObject({ status: 409 });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("keeps the public homepage available when slideshow storage is missing", async () => {
    mocks.publicOrg.mockResolvedValue({ id: "church-a" });
    mocks.list.mockRejectedValue(Object.assign(new Error("missing"), { code: "P2021" }));
    expect(await publicHomepageSlideshow()).toEqual([]);
  });

  it("tells an administrator when slideshow storage is not ready", async () => {
    mocks.transaction.mockRejectedValue(Object.assign(new Error('relation "homepage_slideshow_photos" does not exist'), { code: "P2021" }));
    await expect(addHomepageSlideshowPhoto({ image: new Uint8Array(1), alt: "Sunday worship" })).rejects.toMatchObject({ status: 503 });
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
