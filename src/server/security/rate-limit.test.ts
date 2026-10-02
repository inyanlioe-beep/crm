import { describe, it, expect } from "vitest";
import { InMemoryRateLimiter } from "./rate-limit";

describe("InMemoryRateLimiter", () => {
  it("allows up to max requests then blocks", async () => {
    const rl = new InMemoryRateLimiter(3, 1000, () => 1000);
    expect((await rl.limit("k")).allowed).toBe(true);
    expect((await rl.limit("k")).allowed).toBe(true);
    expect((await rl.limit("k")).allowed).toBe(true);
    const blocked = await rl.limit("k");
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("tracks remaining count", async () => {
    const rl = new InMemoryRateLimiter(5, 1000, () => 0);
    expect((await rl.limit("k")).remaining).toBe(4);
    expect((await rl.limit("k")).remaining).toBe(3);
  });

  it("resets after the window elapses", async () => {
    let now = 1000;
    const rl = new InMemoryRateLimiter(1, 1000, () => now);
    expect((await rl.limit("k")).allowed).toBe(true);
    expect((await rl.limit("k")).allowed).toBe(false);
    now = 2001; // window passed
    expect((await rl.limit("k")).allowed).toBe(true);
  });

  it("keeps separate counters per key", async () => {
    const rl = new InMemoryRateLimiter(1, 1000, () => 0);
    expect((await rl.limit("a")).allowed).toBe(true);
    expect((await rl.limit("b")).allowed).toBe(true);
    expect((await rl.limit("a")).allowed).toBe(false);
  });
});
