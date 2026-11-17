import { afterEach, expect, it, vi } from "vitest";
const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { organization: { findFirst } } }));
import { findPublicOrganization } from "./public-organization.repository";
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
it("fails closed without a configured church, without reading the oldest row", async () => {
  vi.stubEnv("BITS_PUBLIC_ORGANIZATION_SLUG", "");
  expect(await findPublicOrganization()).toBeNull(); expect(findFirst).not.toHaveBeenCalled();
});
it("uses only the configured active church independently of session", async () => {
  vi.stubEnv("BITS_PUBLIC_ORGANIZATION_SLUG", "saco"); findFirst.mockResolvedValue({ id: "saco" });
  expect(await findPublicOrganization()).toEqual({ id: "saco" });
  expect(findFirst).toHaveBeenCalledWith({ where: { slug: "saco", active: true } });
});
it("does not fall back when the configured church is absent or inactive", async () => {
  vi.stubEnv("BITS_PUBLIC_ORGANIZATION_SLUG", "missing"); findFirst.mockResolvedValue(null);
  expect(await findPublicOrganization()).toBeNull(); expect(findFirst).toHaveBeenCalledTimes(1);
});
