export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // epoch ms
}

export interface RateLimiter {
  /** Consume one unit for `key`. Returns whether it was allowed. */
  limit(key: string): Promise<RateLimitResult>;
}

/**
 * Fixed-window in-memory limiter. Suitable for a single instance / dev. Not
 * shared across processes — for multi-instance deployments configure Upstash
 * (see getRateLimiter). Exposes `now` injection for deterministic tests.
 */
export class InMemoryRateLimiter implements RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private max: number,
    private windowMs: number,
    private now: () => number = () => Date.now(),
  ) {}

  async limit(key: string): Promise<RateLimitResult> {
    const t = this.now();
    const entry = this.hits.get(key);

    if (!entry || entry.resetAt <= t) {
      const resetAt = t + this.windowMs;
      this.hits.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: this.max - 1, resetAt };
    }

    if (entry.count >= this.max) {
      return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }

    entry.count += 1;
    return {
      allowed: true,
      remaining: this.max - entry.count,
      resetAt: entry.resetAt,
    };
  }

  /** Testing/maintenance helper. */
  reset(key?: string): void {
    if (key) this.hits.delete(key);
    else this.hits.clear();
  }
}

/**
 * Upstash Redis REST limiter (fixed window via INCR + EXPIRE). Used when
 * UPSTASH_REDIS_REST_URL/TOKEN are configured. Falls back open (allow) on
 * transport errors so auth isn't bricked by a Redis outage.
 */
class UpstashRateLimiter implements RateLimiter {
  constructor(
    private url: string,
    private token: string,
    private max: number,
    private windowSec: number,
  ) {}

  private async cmd(args: (string | number)[]): Promise<unknown> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });
    if (!res.ok) throw new Error(`Upstash error ${res.status}`);
    const data = (await res.json()) as { result: unknown };
    return data.result;
  }

  async limit(key: string): Promise<RateLimitResult> {
    const redisKey = `rl:${key}`;
    try {
      const count = Number(await this.cmd(["INCR", redisKey]));
      if (count === 1) {
        await this.cmd(["EXPIRE", redisKey, this.windowSec]);
      }
      const resetAt = Date.now() + this.windowSec * 1000;
      if (count > this.max) {
        return { allowed: false, remaining: 0, resetAt };
      }
      return { allowed: true, remaining: this.max - count, resetAt };
    } catch {
      // Fail open: don't block legitimate users on infra failure.
      return { allowed: true, remaining: this.max, resetAt: Date.now() };
    }
  }
}

// Named limiter registry so each use-site gets a stable instance.
const registry = new Map<string, RateLimiter>();

export interface LimiterConfig {
  max: number;
  windowMs: number;
}

export function getRateLimiter(
  name: string,
  config: LimiterConfig,
): RateLimiter {
  const existing = registry.get(name);
  if (existing) return existing;

  // Read the (optional) Upstash vars directly rather than through getEnv(), so
  // rate limiting does not depend on DATABASE_URL/SESSION_SECRET validation.
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const limiter: RateLimiter =
    upstashUrl && upstashToken
      ? new UpstashRateLimiter(
          upstashUrl,
          upstashToken,
          config.max,
          Math.ceil(config.windowMs / 1000),
        )
      : new InMemoryRateLimiter(config.max, config.windowMs);

  registry.set(name, limiter);
  return limiter;
}

/** Test seam. */
export function setRateLimiter(name: string, limiter: RateLimiter): void {
  registry.set(name, limiter);
}
