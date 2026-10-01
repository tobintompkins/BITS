import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyDonor } from "@/lib/validation/donor";
const m = vi.hoisted(() => ({ auth: vi.fn(), actor: vi.fn(), memberships: vi.fn(), find: vi.fn(), list: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), audit: vi.fn(), transaction: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { userAccount: { findUnique: m.actor }, organizationMembership: { findMany: m.memberships }, donor: { findFirst: m.find, findMany: m.list, count: m.count }, $transaction: m.transaction } }));
vi.mock("@/server/repositories/audit-event.repository", () => ({ createAuditEvent: m.audit }));
import { getDonor, listDonors, requireDonorAccess, saveDonor } from "./donor-management.service";
const org = { id: "org-a", active: true, name: "Church A" };
function role(code: string) { m.memberships.mockResolvedValue([{ organizationId: org.id, organization: org, roleType: { code } }]); }
beforeEach(() => {
  vi.resetAllMocks();
  m.auth.mockResolvedValue({ userId: "clerk-user", orgId: "clerk-org-a" });
  m.actor.mockResolvedValue({ id: "staff-a", active: true }); role("TREASURER");
  m.list.mockResolvedValue([]); m.count.mockResolvedValue(0);
  m.create.mockResolvedValue({ id: "donor-a" }); m.update.mockResolvedValue({ id: "donor-a" });
  m.transaction.mockImplementation(async fn => fn({ donor: { findFirst: m.find, create: m.create, update: m.update } }));
});
const input = { ...emptyDonor, firstName: "Jordan", lastName: "Taylor" };
describe("donor maintenance authorization and integrity", () => {
  it("rejects signed-out access before querying records", async () => { m.auth.mockResolvedValue({ userId: null }); await expect(listDonors("", "all", 1)).rejects.toThrow(); expect(m.list).not.toHaveBeenCalled(); });
  it("rejects inactive accounts", async () => { m.actor.mockResolvedValue({ id: "staff", active: false }); await expect(requireDonorAccess()).rejects.toThrow(); });
  it("requires membership in active Clerk organization", async () => { await requireDonorAccess(); expect(m.memberships.mock.calls[0][0].where.organization).toEqual({ active: true, clerkOrganizationId: "clerk-org-a" }); });
  it("rejects ambiguous organization fallback", async () => { m.auth.mockResolvedValue({ userId: "u", orgId: null }); m.memberships.mockResolvedValue([{}, {}]); await expect(requireDonorAccess()).rejects.toThrow("Select a church"); });
  it.each(["DONOR", "VOLUNTEER"])("blocks %s from donor directory", async code => { role(code); await expect(listDonors("", "all", 1)).rejects.toThrow(); expect(m.list).not.toHaveBeenCalled(); });
  it("allows report viewers to read but not mutate", async () => { role("REPORT_VIEWER"); expect((await listDonors("", "all", 1)).canEdit).toBe(false); await expect(saveDonor(org.id, null, input)).rejects.toThrow(); expect(m.transaction).not.toHaveBeenCalled(); });
  it("scopes search and counts and bounds pagination", async () => { await listDonors("Jordan Taylor", "inactive", 2); const query = m.list.mock.calls[0][0]; expect(query.where.organizationId).toBe(org.id); expect(query.where.active).toBe(false); expect(query.where.AND).toHaveLength(2); expect(query.skip).toBe(25); expect(query.take).toBe(25); expect(m.count.mock.calls[0][0].where).toEqual(query.where); });
  it("does not fetch another church's donor by id", async () => { m.find.mockResolvedValue(null); await expect(getDonor("foreign-id")).rejects.toThrow("not found"); expect(m.find).toHaveBeenCalledWith({ where: { id: "foreign-id", organizationId: org.id } }); });
  it("rejects stale forms after organization switch", async () => { await expect(saveDonor("org-b", null, input)).rejects.toThrow("selection changed"); expect(m.transaction).not.toHaveBeenCalled(); });
  it("creates accountless donors and audits inside the transaction", async () => { role("DATA_ENTRY"); await saveDonor(org.id, null, { ...input, organizationId: "org-b", userAccountId: "attacker" }); const data = m.create.mock.calls[0][0].data; expect(data.organizationId).toBe(org.id); expect(data).not.toHaveProperty("userAccountId"); expect(m.audit.mock.calls[0][1]).toHaveProperty("donor"); expect(m.audit.mock.calls[0][0].actorUserAccountId).toBe("staff-a"); });
  it("cannot update a foreign donor", async () => { m.find.mockResolvedValue(null); await expect(saveDonor(org.id, "foreign", input)).rejects.toThrow(); expect(m.update).not.toHaveBeenCalled(); });
  it("deactivates without deleting or altering gifts/account links", async () => { m.find.mockResolvedValue({ id: "donor-a", ...input }); await saveDonor(org.id, "donor-a", { ...input, active: false }); expect(m.update.mock.calls[0][0].where).toEqual({ id: "donor-a", organizationId: org.id }); expect(m.update.mock.calls[0][0].data.active).toBe(false); expect(m.update.mock.calls[0][0].data).not.toHaveProperty("donations"); });
  it("fails the write transaction if the audit fails", async () => { m.audit.mockRejectedValue(new Error("audit unavailable")); await expect(saveDonor(org.id, null, input)).rejects.toThrow("audit unavailable"); });
  it("rejects invalid details before writing", async () => { await expect(saveDonor(org.id, null, { ...input, firstName: "", email: "bad" })).rejects.toThrow(); expect(m.transaction).not.toHaveBeenCalled(); });
  it("keeps private note contents out of audit metadata", async () => { await saveDonor(org.id, null, { ...input, internalNotes: "private-sensitive-note" }); expect(JSON.stringify(m.audit.mock.calls)).not.toContain("private-sensitive-note"); });
});
