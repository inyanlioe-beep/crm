import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyStripeSignature } from "./stripe-signature";

const secret = "whsec_test_secret";

function sign(payload: string, timestamp: number): string {
  const sig = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  return `t=${timestamp},v1=${sig}`;
}

describe("verifyStripeSignature", () => {
  const now = 1_700_000_000_000; // fixed ms

  it("accepts a valid, fresh signature", async () => {
    const payload = JSON.stringify({ type: "checkout.session.completed" });
    const header = sign(payload, Math.floor(now / 1000));
    expect(await verifyStripeSignature(payload, header, secret, 300, now)).toBe(
      true,
    );
  });

  it("rejects a tampered payload", async () => {
    const payload = JSON.stringify({ amount: 100 });
    const header = sign(payload, Math.floor(now / 1000));
    const tampered = JSON.stringify({ amount: 999 });
    expect(
      await verifyStripeSignature(tampered, header, secret, 300, now),
    ).toBe(false);
  });

  it("rejects an old timestamp (replay protection)", async () => {
    const payload = "x";
    const old = Math.floor(now / 1000) - 10_000;
    const header = sign(payload, old);
    expect(await verifyStripeSignature(payload, header, secret, 300, now)).toBe(
      false,
    );
  });

  it("rejects when header or secret is missing", async () => {
    expect(await verifyStripeSignature("x", null, secret)).toBe(false);
    expect(await verifyStripeSignature("x", "t=1,v1=abc", "")).toBe(false);
  });

  it("rejects a wrong signing secret", async () => {
    const payload = "y";
    const header = sign(payload, Math.floor(now / 1000));
    expect(
      await verifyStripeSignature(payload, header, "wrong_secret", 300, now),
    ).toBe(false);
  });
});
