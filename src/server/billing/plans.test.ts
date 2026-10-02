import { describe, it, expect } from "vitest";
import { limitFor, withinLimit, PLAN_LIMITS } from "./plans";

describe("plan limits", () => {
  it("free plan has finite limits", () => {
    expect(Number.isFinite(PLAN_LIMITS.free.members)).toBe(true);
    expect(limitFor("free", "contacts")).toBe(50);
  });

  it("pro plan is unlimited", () => {
    expect(limitFor("pro", "members")).toBe(Infinity);
    expect(withinLimit("pro", "contacts", 1_000_000, 1)).toBe(true);
  });

  it("withinLimit allows up to the limit and blocks beyond", () => {
    expect(withinLimit("free", "members", 1, 1)).toBe(true); // 1+1=2 == limit
    expect(withinLimit("free", "members", 2, 1)).toBe(false); // 2+1=3 > 2
  });

  it("supports batch additions", () => {
    expect(withinLimit("free", "contacts", 40, 10)).toBe(true); // 50 == limit
    expect(withinLimit("free", "contacts", 45, 10)).toBe(false); // 55 > 50
  });
});
