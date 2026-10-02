import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";

/**
 * BUG-3 + BUG-8 regression: parseWebhook must resolve current_period_end and
 * the plan from the Stripe SUBSCRIPTION (fetched via API), not from the
 * checkout session object. Stripe env is set before import so the factory
 * builds a StripeProvider.
 */
describe("Stripe webhook parsing (BUG-3/BUG-8)", () => {
  let billing: typeof import("./billing");
  const SECRET = "whsec_test";

  function signed(body: object): { payload: string; header: string } {
    const payload = JSON.stringify(body);
    const ts = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", SECRET)
      .update(`${ts}.${payload}`)
      .digest("hex");
    return { payload, header: `t=${ts},v1=${sig}` };
  }

  beforeAll(async () => {
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ?? "postgres://u:p@localhost:5432/db";
    process.env.SESSION_SECRET =
      "integration-secret-at-least-32-characters-long";
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    process.env.STRIPE_PRICE_PRO = "price_pro_123";
    billing = await import("./billing");
    billing.setBillingProvider(null); // ensure fresh provider from env
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves period end + pro plan from the fetched subscription on checkout.session.completed", async () => {
    const periodEnd = 1_900_000_000; // seconds
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          items: {
            data: [
              {
                current_period_end: periodEnd,
                price: { id: "price_pro_123" },
              },
            ],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const provider = billing.getBillingProvider();
    expect(provider.id).toBe("stripe");

    const { payload, header } = signed({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_123",
          customer: "cus_123",
          subscription: "sub_123",
          metadata: { tenantId: "11111111-1111-1111-1111-111111111111" },
        },
      },
    });

    const event = await provider.parseWebhook(payload, header);
    expect(event.type).toBe("subscription.active");
    if (event.type === "subscription.active") {
      expect(event.plan).toBe("pro");
      expect(event.currentPeriodEnd).toEqual(new Date(periodEnd * 1000));
      expect(event.externalSubscriptionId).toBe("sub_123");
    }
  });

  it("treats a non-pro price as a cancellation (no accidental pro upgrade)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          items: {
            data: [
              { current_period_end: 1_900_000_000, price: { id: "price_other" } },
            ],
          },
        }),
        { status: 200 },
      ),
    );

    const provider = billing.getBillingProvider();
    const { payload, header } = signed({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_999",
          customer: "cus_999",
          metadata: { tenantId: "22222222-2222-2222-2222-222222222222" },
        },
      },
    });

    const event = await provider.parseWebhook(payload, header);
    expect(event.type).toBe("subscription.canceled");
  });

  it("rejects an invalid signature", async () => {
    const provider = billing.getBillingProvider();
    await expect(
      provider.parseWebhook("{}", "t=1,v1=bad"),
    ).rejects.toThrow(/signature/i);
  });
});
