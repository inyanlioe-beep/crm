import { NextRequest, NextResponse } from "next/server";
import { getBillingProvider } from "@/server/billing/billing";
import { activatePlan, cancelPlan } from "@/server/services/subscription";

// Stripe webhooks need the raw body for signature verification, so read text().
export async function POST(req: NextRequest) {
  const provider = getBillingProvider();
  if (!provider.enabled) {
    return NextResponse.json({ received: true, ignored: true });
  }

  const payload = await req.text();
  const signature = req.headers.get("stripe-signature");

  let event;
  try {
    event = await provider.parseWebhook(payload, signature);
  } catch {
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400 },
    );
  }

  try {
    if (event.type === "subscription.active") {
      await activatePlan({
        tenantId: event.tenantId,
        plan: event.plan,
        provider: provider.id,
        externalCustomerId: event.externalCustomerId,
        externalSubscriptionId: event.externalSubscriptionId,
        currentPeriodEnd: event.currentPeriodEnd,
      });
    } else if (event.type === "subscription.canceled") {
      await cancelPlan(event.tenantId);
    }
  } catch {
    // Return 500 so the provider retries delivery.
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
