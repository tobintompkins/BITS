import { describe, expect, it } from "vitest";

import {
  canContactByEmail,
  canContactByPhone,
  canContactByPostalMail,
  canContactBySms,
  isDoNotContact,
} from "@/lib/members/do-not-contact";

describe("do-not-contact helpers", () => {
  it("detects DO_NOT_CONTACT preferred method", () => {
    expect(
      isDoNotContact({ preferredContactMethod: "DO_NOT_CONTACT" }),
    ).toBe(true);
    expect(isDoNotContact({ preferredContactMethod: "EMAIL" })).toBe(false);
  });

  it("blocks all channels when DO_NOT_CONTACT is set", () => {
    const member = {
      preferredContactMethod: "DO_NOT_CONTACT",
      allowEmail: true,
      allowSms: true,
      allowPhoneCalls: true,
      allowPostalMail: true,
    };
    expect(canContactByEmail(member)).toBe(false);
    expect(canContactBySms(member)).toBe(false);
    expect(canContactByPhone(member)).toBe(false);
    expect(canContactByPostalMail(member)).toBe(false);
  });

  it("respects individual allow flags", () => {
    const member = {
      preferredContactMethod: "EMAIL",
      allowEmail: true,
      allowSms: false,
      allowPhoneCalls: true,
      allowPostalMail: false,
    };
    expect(canContactByEmail(member)).toBe(true);
    expect(canContactBySms(member)).toBe(false);
    expect(canContactByPhone(member)).toBe(true);
    expect(canContactByPostalMail(member)).toBe(false);
  });
});
