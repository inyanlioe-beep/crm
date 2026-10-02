import { describe, it, expect } from "vitest";
import { parseRange, defaultRange, MAX_RANGE_DAYS } from "./analytics";

describe("parseRange", () => {
  it("parses valid from/to dates", () => {
    const r = parseRange({ from: "2026-01-01", to: "2026-01-31" });
    expect(r.from.toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(r.to.toISOString().slice(0, 10)).toBe("2026-01-31");
  });

  it("clamps ranges longer than MAX_RANGE_DAYS to the most recent window (BUG-6)", () => {
    // Request ~2 years; should be clamped to MAX_RANGE_DAYS keeping `to`.
    const r = parseRange({ from: "2024-01-01", to: "2026-01-01" });
    const days = Math.round(
      (r.to.getTime() - r.from.getTime()) / (24 * 60 * 60 * 1000),
    );
    expect(days).toBeLessThanOrEqual(MAX_RANGE_DAYS);
    expect(days).toBeGreaterThanOrEqual(MAX_RANGE_DAYS - 1);
    // `to` is preserved (end of the requested day).
    expect(r.to.toISOString().slice(0, 10)).toBe("2026-01-01");
  });

  it("includes the whole 'to' day (end of day)", () => {
    const r = parseRange({ from: "2026-01-01", to: "2026-01-01" });
    expect(r.to.getTime()).toBeGreaterThan(r.from.getTime());
  });

  it("falls back to default when from is after to", () => {
    const r = parseRange({ from: "2026-02-01", to: "2026-01-01" });
    const def = defaultRange();
    // default spans ~30 days
    const days = Math.round(
      (r.to.getTime() - r.from.getTime()) / (24 * 60 * 60 * 1000),
    );
    expect(days).toBe(30);
    expect(r.to.getTime()).toBeLessThanOrEqual(def.to.getTime() + 1000);
  });

  it("falls back to default on invalid input", () => {
    const r = parseRange({ from: "not-a-date", to: "also-bad" });
    const days = Math.round(
      (r.to.getTime() - r.from.getTime()) / (24 * 60 * 60 * 1000),
    );
    expect(days).toBe(30);
  });

  it("defaults to last 30 days when nothing provided", () => {
    const r = parseRange({});
    const days = Math.round(
      (r.to.getTime() - r.from.getTime()) / (24 * 60 * 60 * 1000),
    );
    expect(days).toBe(30);
  });
});
