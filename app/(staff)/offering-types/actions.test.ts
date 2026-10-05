import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ save: vi.fn(), redirect: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("@/server/services/offering-type.service", () => ({
  OfferingTypeError: class extends Error {}, setOfferingTypeActive: m.save,
  saveOfferingType: vi.fn(), offeringTypeFormFromUnknown: vi.fn(),
}));
import { setOfferingTypeActiveAction } from "./actions";
beforeEach(() => { vi.resetAllMocks(); });
it("lets the successful redirect propagate instead of returning a false failure", async () => {
  m.save.mockResolvedValue({ id: "fund" });
  const redirectSignal = new Error("NEXT_REDIRECT");
  m.redirect.mockImplementation(() => { throw redirectSignal; });
  const form = new FormData(); form.set("confirm", "on");
  await expect(setOfferingTypeActiveAction("org", "fund", false, "timestamp", { message: "" }, form)).rejects.toBe(redirectSignal);
  expect(m.revalidate).toHaveBeenCalledWith("/offering-types/fund");
});
it("does not redirect after a failed write", async () => {
  m.save.mockRejectedValue(new Error("database unavailable"));
  const form = new FormData(); form.set("confirm", "on");
  const result = await setOfferingTypeActiveAction("org", "fund", false, "timestamp", { message: "" }, form);
  expect(result.message).toContain("Unable"); expect(m.redirect).not.toHaveBeenCalled();
});
