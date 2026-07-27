import { describe, expect, it } from "vitest";

import {
  buildOrganizationAuditChanges,
  emptyOrganizationSettingsValues,
  organizationSettingsSchema,
} from "@/lib/validation/organization-settings";
import {
  getLogoPublicUrl,
  validateLogoFile,
} from "@/lib/storage/organization-logo";

describe("organizationSettingsSchema", () => {
  it("requires church name and email", () => {
    const result = organizationSettingsSchema.safeParse({
      ...emptyOrganizationSettingsValues,
      churchName: "",
      displayName: "Demo",
      addressLine1: "123 Main St",
      city: "Nashville",
      state: "TN",
      zipCode: "37203",
      country: "US",
      email: "",
      timeZone: "America/Chicago",
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error.flatten().fieldErrors.churchName).toBeDefined();
      expect(result.error.flatten().fieldErrors.email).toBeDefined();
    }
  });

  it("validates phone, zip, and website formats", () => {
    const result = organizationSettingsSchema.safeParse({
      ...emptyOrganizationSettingsValues,
      churchName: "Demo Church",
      displayName: "Demo",
      addressLine1: "123 Main St",
      city: "Nashville",
      state: "TN",
      zipCode: "ABCDE",
      country: "US",
      phone: "123",
      email: "office@example.org",
      website: "example.org",
      timeZone: "America/Chicago",
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      expect(fieldErrors.zipCode).toBeDefined();
      expect(fieldErrors.phone).toBeDefined();
      expect(fieldErrors.website).toBeDefined();
    }
  });

  it("accepts valid organization settings", () => {
    const result = organizationSettingsSchema.safeParse({
      ...emptyOrganizationSettingsValues,
      churchName: "Demo Church",
      displayName: "Demo",
      addressLine1: "123 Main St",
      city: "Nashville",
      state: "TN",
      zipCode: "37203-1234",
      country: "US",
      phone: "6155550100",
      email: "office@example.org",
      website: "https://example.org",
      timeZone: "America/Chicago",
      statementFooter: "Thank you.",
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.phone).toBe("(615) 555-0100");
      expect(result.data.email).toBe("office@example.org");
    }
  });
});

describe("buildOrganizationAuditChanges", () => {
  it("records changed fields with old and new values", () => {
    const previous = {
      ...emptyOrganizationSettingsValues,
      churchName: "Old Church",
      email: "old@example.org",
    };
    const next = {
      ...previous,
      churchName: "New Church",
      email: "new@example.org",
    };

    const changes = buildOrganizationAuditChanges(previous, next);

    expect(changes).toEqual([
      {
        field: "churchName",
        oldValue: "Old Church",
        newValue: "New Church",
      },
      {
        field: "email",
        oldValue: "old@example.org",
        newValue: "new@example.org",
      },
    ]);
  });
});

describe("organization logo helpers", () => {
  it("rejects files larger than 5MB", () => {
    const file = {
      name: "logo.png",
      size: 6 * 1024 * 1024,
      type: "image/png",
    } as File;

    expect(validateLogoFile(file)).toEqual({
      ok: false,
      message: "Logo must be 5MB or smaller.",
    });
  });

  it("builds a public logo URL from storage key", () => {
    expect(getLogoPublicUrl("/uploads/organizations/123/logo.png")).toBe(
      "/uploads/organizations/123/logo.png",
    );
  });
});
