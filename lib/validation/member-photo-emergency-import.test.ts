import { describe, expect, it } from "vitest";

import {
  emergencyContactSchema,
  buildEmergencyContactAuditChanges,
} from "@/lib/validation/emergency-contact";
import { validateMemberPhotoFile } from "@/lib/storage/member-photo";
import { buildMemberImportPreview } from "@/lib/validation/member-import";

describe("emergencyContactSchema", () => {
  it("requires name, relationship, and phone", () => {
    const result = emergencyContactSchema.safeParse({
      name: "",
      relationship: "",
      phone: "",
      email: "",
      isPrimary: false,
      notes: "",
    });

    expect(result.success).toBe(false);
  });

  it("accepts valid emergency contact", () => {
    const result = emergencyContactSchema.safeParse({
      name: "Jamie Lee",
      relationship: "Spouse",
      phone: "(615) 555-0100",
      email: "jamie@example.org",
      isPrimary: true,
      notes: "",
    });

    expect(result.success).toBe(true);
  });
});

describe("buildEmergencyContactAuditChanges", () => {
  it("records changed fields", () => {
    const changes = buildEmergencyContactAuditChanges(
      { phone: "(615) 555-0100" },
      { phone: "(615) 555-0200" },
    );

    expect(changes).toEqual([
      {
        field: "phone",
        oldValue: "(615) 555-0100",
        newValue: "(615) 555-0200",
      },
    ]);
  });
});

describe("validateMemberPhotoFile", () => {
  it("rejects files over 5MB", () => {
    const file = new File([new Uint8Array(6 * 1024 * 1024)], "photo.jpg", {
      type: "image/jpeg",
    });

    const result = validateMemberPhotoFile(file);
    expect(result.ok).toBe(false);
  });

  it("accepts webp files", () => {
    const file = new File(["x"], "photo.webp", { type: "image/webp" });
    const result = validateMemberPhotoFile(file);
    expect(result.ok).toBe(true);
  });
});

describe("buildMemberImportPreview", () => {
  it("skips duplicate emails", () => {
    const preview = buildMemberImportPreview(
      [
        {
          _rowNumber: 2,
          firstName: "Alex",
          middleName: "",
          lastName: "Rivera",
          preferredName: "",
          suffix: "",
          email: "alex@example.org",
          phone: "(615) 555-0100",
          alternatePhone: "",
          dateOfBirth: "",
          gender: "",
          maritalStatus: "",
          membershipStatus: "VISITOR",
          memberSince: "",
          baptismDate: "",
          salvationDate: "",
          address1: "",
          address2: "",
          city: "",
          state: "",
          zip: "",
          country: "US",
          notes: "",
        },
        {
          _rowNumber: 3,
          firstName: "Alex",
          middleName: "",
          lastName: "Duplicate",
          preferredName: "",
          suffix: "",
          email: "alex@example.org",
          phone: "(615) 555-0101",
          alternatePhone: "",
          dateOfBirth: "",
          gender: "",
          maritalStatus: "",
          membershipStatus: "VISITOR",
          memberSince: "",
          baptismDate: "",
          salvationDate: "",
          address1: "",
          address2: "",
          city: "",
          state: "",
          zip: "",
          country: "US",
          notes: "",
        },
      ],
      new Set(["existing@example.org"]),
    );

    expect(preview.validRows).toHaveLength(1);
    expect(preview.skipRows).toHaveLength(1);
  });
});
