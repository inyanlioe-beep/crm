import { getEnv } from "@/lib/env";
import type { Plan } from "./plans";

export interface CheckoutInput {
  tenantId: string;
  plan: Plan;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutResult {
  url: string;
}

export type WebhookEvent =
  | {
      type: "subscription.active";
      tenantId: string;
      plan: Plan;
      externalCustomerId: string | null;
      externalSubscriptionId: string | null;
      currentPeriodEnd: Date | null;
    }
  | {
      type: "subscription.canceled";
      tenantId: string;
    }
  | { type: "ignored" };

export interface BillingProvider {
  readonly id: string;
  readonly enabled: boolean;
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  /** Verify + parse a webhook payload into a normalized event. */
  parseWebhook(payload: string, signature: string | null): Promise<WebhookEvent>;
}

/**
 * Stripe provider using the HTTP API (no SDK dependency). Only enabled when
 * STRIPE_SECRET_KEY is present. Webhook signature verification is delegated to
 * verifyStripeSignature (HMAC-SHA256 per Stripe's scheme).
 */
class StripeProvider implements BillingProvider {
  readonly id = "stripe";
  readonly enabled = true;
  constructor(
    private secretKey: string,
    private webhookSecret: string,
    private pricePro: string,
  ) {}

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    if (!this.pricePro) throw new Error("STRIPE_PRICE_PRO is not configured");
    const body = new URLSearchParams({
      mode: "subscription",
      "line_items[0][price]": this.pricePro,
      "line_items[0][quantity]": "1",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      customer_email: input.customerEmail,
      "metadata[tenantId]": input.tenantId,
      "subscription_data[metadata][tenantId]": input.tenantId,
    });
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!res.ok) {
      throw new Error(`Stripe checkout failed (${res.status})`);
    }
    const data = (await res.json()) as { url?: string };
    if (!data.url) throw new Error("Stripe did not return a checkout URL");
    return { url: data.url };
  }

  /** Map a Stripe price id to a plan. Unknown prices are treated as free. */
  private planForPrice(priceId: string | null): Plan {
    if (priceId && this.pricePro && priceId === this.pricePro) return "pro";
    return "free";
  }

  /**
   * Fetch a subscription from Stripe to read authoritative fields: the current
   * period end and the active price id. Handles both the legacy
   * subscription-level `current_period_end` and the newer item-level location
   * (`items.data[0].current_period_end`), per the 2025-03 Stripe API change.
   */
  private async fetchSubscription(subscriptionId: string): Promise<{
    priceId: string | null;
    currentPeriodEnd: Date | null;
  } | null> {
    const res = await fetch(
      `https://api.stripe.com/v1/subscriptions/${subscriptionId}`,
      { headers: { Authorization: `Bearer ${this.secretKey}` } },
    );
    if (!res.ok) return null;
    const sub = (await res.json()) as {
      current_period_end?: number;
      items?: {
        data?: Array<{
          current_period_end?: number;
          price?: { id?: string };
        }>;
      };
    };
    const item = sub.items?.data?.[0];
    const epoch = sub.current_period_end ?? item?.current_period_end ?? null;
    return {
      priceId: item?.price?.id ?? null,
      currentPeriodEnd: epoch ? new Date(epoch * 1000) : null,
    };
  }

  async parseWebhook(
    payload: string,
    signature: string | null,
  ): Promise<WebhookEvent> {
    const { verifyStripeSignature } = await import("./stripe-signature");
    const ok = await verifyStripeSignature(
      payload,
      signature,
      this.webhookSecret,
    );
    if (!ok) throw new Error("Invalid Stripe signature");

    const event = JSON.parse(payload) as {
      type: string;
      data: { object: Record<string, unknown> };
    };
    const obj = event.data.object;
    const tenantId =
      (obj.metadata as Record<string, string> | undefined)?.tenantId ??
      ((obj.subscription_details as Record<string, unknown> | undefined)
        ?.metadata as Record<string, string> | undefined)?.tenantId ??
      "";

    switch (event.type) {
      case "checkout.session.completed":
      case "customer.subscription.updated":
      case "invoice.paid": {
        if (!tenantId) return { type: "ignored" };

        // The subscription id lives in `obj.subscription` for checkout
        // sessions and invoices; for customer.subscription.* the object IS the
        // subscription (its id is in `obj.id`).
        const isSubscriptionObject =
          event.type === "customer.subscription.updated";
        const subscriptionId =
          (obj.subscription as string | undefined) ??
          (isSubscriptionObject ? (obj.id as string | undefined) : undefined) ??
          null;

        // Resolve period end + plan authoritatively from the subscription.
        // The event object itself (esp. a Checkout Session) does NOT carry
        // current_period_end, so reading it off `obj` yields null.
        let currentPeriodEnd: Date | null = null;
        let plan: Plan = "pro"; // default for a single-paid-plan setup
        if (subscriptionId) {
          const fetched = await this.fetchSubscription(subscriptionId);
          if (fetched) {
            currentPeriodEnd = fetched.currentPeriodEnd;
            plan = this.planForPrice(fetched.priceId);
          }
        } else if (typeof obj.current_period_end === "number") {
          // Fallback: object already is a subscription with a top-level field.
          currentPeriodEnd = new Date(obj.current_period_end * 1000);
        }

        // A resolved "free" price means this isn't the pro subscription (e.g.
        // a downgrade reflected on the subscription) — treat as cancellation.
        if (plan === "free") {
          return { type: "subscription.canceled", tenantId };
        }

        return {
          type: "subscription.active",
          tenantId,
          plan,
          externalCustomerId: (obj.customer as string) ?? null,
          externalSubscriptionId:
            subscriptionId ?? (obj.id as string) ?? null,
          currentPeriodEnd,
        };
      }
      case "customer.subscription.deleted":
        if (!tenantId) return { type: "ignored" };
        return { type: "subscription.canceled", tenantId };
      default:
        return { type: "ignored" };
    }
  }
}

/**
 * Fallback used when Stripe isn't configured. Checkout "upgrades" immediately
 * via a local success URL carrying the tenant+plan, so dev/demo works without
 * a payment provider. Webhooks are not used in this mode.
 */
class ManualProvider implements BillingProvider {
  readonly id = "manual";
  readonly enabled = false;

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const url = new URL(input.successUrl);
    url.searchParams.set("manual", "1");
    url.searchParams.set("plan", input.plan);
    return { url: url.toString() };
  }

  async parseWebhook(): Promise<WebhookEvent> {
    return { type: "ignored" };
  }
}

let provider: BillingProvider | null = null;

export function getBillingProvider(): BillingProvider {
  if (provider) return provider;
  const env = getEnv();
  provider =
    env.STRIPE_SECRET_KEY.length > 0
      ? new StripeProvider(
          env.STRIPE_SECRET_KEY,
          env.STRIPE_WEBHOOK_SECRET,
          env.STRIPE_PRICE_PRO,
        )
      : new ManualProvider();
  return provider;
}

/** Test seam. */
export function setBillingProvider(p: BillingProvider | null): void {
  provider = p;
}
