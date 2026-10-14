import { describe, expect, it } from "vitest";

import {
  clerkLiveInvitesAuthorized,
  getStaffInvitationProviderMode,
  getStaffInvitationRedirectOrigin,
  isAllowedLiveInvitationEmail,
  redactStaffInvitationProviderError,
  staffInvitationAcceptUrl,
} from "./config";

describe("staff invitation config", () => {
  it("defaults the provider to mock", () => {
    expect(getStaffInvitationProviderMode({})).toBe("mock");
    expect(
      getStaffInvitationProviderMode({ BITS_STAFF_INVITATION_PROVIDER: "clerk" }),
    ).toBe("clerk");
  });

  it("uses the fixed configured origin and ignores path or credentials", () => {
    expect(
      getStaffInvitationRedirectOrigin({
        BITS_STAFF_INVITATION_REDIRECT_ORIGIN: "https://app.example.test/extra",
      }),
    ).toEqual({ ok: true, origin: "https://app.example.test" });
    expect(
      getStaffInvitationRedirectOrigin({
        APP_BASE_URL: "https://user:pass@app.example.test",
      }).ok,
    ).toBe(false);
  });

  it("builds the accept URL from the configured origin only", () => {
    expect(
      staffInvitationAcceptUrl(
        "https://app.example.test",
        "00000000-0000-4000-8000-00000000e001",
      ),
    ).toBe(
      "https://app.example.test/staff-invitations/accept?intent=00000000-0000-4000-8000-00000000e001",
    );
  });

  it("refuses live Clerk sends without an explicit test-mode grant", () => {
    expect(
      clerkLiveInvitesAuthorized({
        BITS_STAFF_INVITATION_PROVIDER: "clerk",
        CLERK_SECRET_KEY: "sk_test_example",
      }),
    ).toBe(false);
    expect(
      clerkLiveInvitesAuthorized({
        BITS_STAFF_INVITATION_PROVIDER: "clerk",
        BITS_STAFF_INVITATION_ALLOW_LIVE: "1",
        CLERK_SECRET_KEY: "sk_live_example",
      }),
    ).toBe(false);
  });

  it("allowlists only configured fictional live emails", () => {
    expect(
      isAllowedLiveInvitationEmail("one@example.test", {
        BITS_STAFF_INVITATION_ALLOWED_EMAILS: "one@example.test, two@example.test",
      }),
    ).toBe(true);
    expect(
      isAllowedLiveInvitationEmail("other@example.test", {
        BITS_STAFF_INVITATION_ALLOWED_EMAILS: "one@example.test",
      }),
    ).toBe(false);
  });

  it("redacts emails, secrets, and provider ids", () => {
    const redacted = redactStaffInvitationProviderError(
      new Error("Clerk 403 for pat@church.test sk_test_abc orginv_123 user_456 org_789"),
    );
    expect(redacted).not.toMatch(/@/);
    expect(redacted).not.toMatch(/sk_test_/);
    expect(redacted).not.toMatch(/orginv_/);
    expect(redacted).toContain("[redacted-email]");
  });
});
