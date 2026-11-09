import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findPrimary: vi.fn(),
  requireEdit: vi.fn(),
  save: vi.fn(),
  load: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findPrimaryOrganization: mocks.findPrimary,
}));

vi.mock("@/lib/auth/permissions", () => ({
  requireOrganizationEditAccess: mocks.requireEdit,
}));

vi.mock("@/server/services/organization-settings.service", () => ({
  saveOrganizationSettings: mocks.save,
  getOrganizationSettingsValues: mocks.load,
}));

import { saveOrganizationSettingsAction } from "@/app/(staff)/settings/organization/actions";
import { createOrganizationSettingsActionState } from "@/lib/validation/organization-settings";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";

function form(logo?: File) {
  const data = new FormData();
  data.set("churchName", "Alpha Chapel");
  data.set("displayName", "Alpha Chapel");
  data.set("ein", "");
  data.set("addressLine1", "1 Test Lane");
  data.set("addressLine2", "");
  data.set("city", "Testville");
  data.set("state", "TN");
  data.set("zipCode", "37201");
  data.set("country", "US");
  data.set("phone", "");
  data.set("email", "office@alpha.test");
  data.set("website", "");
  data.set("timeZone", "America/New_York");
  data.set("statementFooter", "");
  data.set("logoUrl", "");
  if (logo) data.set("logoFile", logo);
  return data;
}

describe("saveOrganizationSettingsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "clerk-user" });
    mocks.findPrimary.mockResolvedValue({ id: ORG_ID, logoStorageKey: null });
    mocks.requireEdit.mockResolvedValue({ canEdit: true, isSuperAdmin: false });
  });

  it("does not save when no church is resolved", async () => {
    mocks.findPrimary.mockResolvedValue(null);
    const result = await saveOrganizationSettingsAction(
      createOrganizationSettingsActionState(),
      form(new File(["bytes"], "logo.png", { type: "image/png" })),
    );
    expect(result.status).toBe("error");
    expect(result.message).toMatch(/select a church/i);
    expect(mocks.requireEdit).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("does not save when edit access is denied", async () => {
    mocks.requireEdit.mockRejectedValue(new Error("You do not have permission to edit organization settings."));
    const result = await saveOrganizationSettingsAction(
      createOrganizationSettingsActionState(),
      form(),
    );
    expect(result.status).toBe("error");
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("reports success when the saved row is committed and logo cleanup is incomplete", async () => {
    mocks.save.mockResolvedValue({
      organization: {
        id: ORG_ID,
        name: "Alpha Chapel",
        displayName: "Alpha Chapel",
        ein: null,
        mailingAddressLine1: "1 Test Lane",
        mailingAddressLine2: null,
        city: "Testville",
        state: "TN",
        postalCode: "37201",
        country: "US",
        contactPhone: null,
        contactEmail: "office@alpha.test",
        websiteUrl: null,
        statementFooterText: null,
        timeZone: "America/New_York",
        logoStorageKey: `/uploads/organizations/${ORG_ID}/logo-abc.png`,
      },
      cleanupNotice: "Settings saved. The previous logo file is still stored.",
    });
    const result = await saveOrganizationSettingsAction(
      createOrganizationSettingsActionState(),
      form(),
    );
    expect(result.status).toBe("success");
    expect(result.message).toMatch(/Updated Successfully/);
    expect(result.message).toMatch(/still stored/i);
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ churchName: "Alpha Chapel" }),
      expect.objectContaining({ removeLogo: false }),
    );
  });
});
