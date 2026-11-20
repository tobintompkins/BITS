import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createMemberStripeCheckout: vi.fn(),
}));

vi.mock("@/server/services/member-stripe-giving.service", () => ({
  createMemberStripeCheckout: mocks.createMemberStripeCheckout,
}));

import { POST } from "./route";

describe("member checkout route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not put a Stripe error or a non-Stripe URL in the redirect", async () => {
    mocks.createMemberStripeCheckout.mockResolvedValueOnce({
      status: "STRIPE_ERROR",
      message: "sk_test_secret leaked by provider",
    });
    function request() {
      return new Request(
        "https://firstupcsaco.up.railway.app/api/portal/stripe/checkout",
        {
          method: "POST",
          headers: { origin: "https://firstupcsaco.up.railway.app" },
          body: new FormData(),
        },
      );
    }
    const errorResponse = await POST(request());
    expect(errorResponse.status).toBe(303);
    const location = errorResponse.headers.get("location") ?? "";
    expect(location).not.toContain("sk_test_");
    expect(new URL(location).searchParams.get("error")).toBe(
      "Stripe could not start test checkout.",
    );

    mocks.createMemberStripeCheckout.mockResolvedValueOnce({
      status: "READY",
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_checkout",
      metadata: {},
    });
    const ready = await POST(request());
    expect(ready.headers.get("location")).toBe(
      "https://checkout.stripe.com/c/pay/cs_test_checkout",
    );
  });
});
