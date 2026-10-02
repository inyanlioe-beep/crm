import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify a Stripe webhook signature per Stripe's scheme:
 *   Stripe-Signature: t=<timestamp>,v1=<hmac_sha256(timestamp + "." + body)>
 * Uses the endpoint's signing secret. Rejects if the timestamp is too old
 * (default tolerance 5 minutes) to mitigate replay.
 */
export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  toleranceSeconds = 300,
  now: number = Date.now(),
): Promise<boolean> {
  if (!header || !secret) return false;

  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const idx = kv.indexOf("=");
      return [kv.slice(0, idx).trim(), kv.slice(idx + 1).trim()];
    }),
  ) as Record<string, string>;

  const timestamp = parts["t"];
  const expectedSig = parts["v1"];
  if (!timestamp || !expectedSig) return false;

  // Replay protection.
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(now / 1000 - ts) > toleranceSeconds) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const computed = createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");

  const a = Buffer.from(computed);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
