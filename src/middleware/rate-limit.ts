import type { MiddlewareHandler } from "hono";
import { AppError } from "../lib/errors.js";
import type { AppEnv } from "../types.js";

interface Bucket {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;
const buckets = new Map<string, Bucket>();

/**
 * Tiny fixed-window limiter for auth endpoints. Good enough for a single
 * instance; swap the Map for Redis/Upstash when you run more than one.
 */
export const authRateLimit: MiddlewareHandler<AppEnv> = async (c, next) => {
  const forwarded = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown";
  const ip = forwarded.split(",")[0]?.trim() || "unknown";
  const now = Date.now();

  const bucket = buckets.get(ip);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  } else if (++bucket.count > MAX_REQUESTS) {
    c.header("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
    throw new AppError(429, "rate_limited", "Too many attempts. Try again in a minute.");
  }

  // Opportunistic cleanup so the map can't grow forever.
  if (buckets.size > 5_000) {
    for (const [key, value] of buckets) {
      if (value.resetAt <= now) buckets.delete(key);
    }
  }

  await next();
};
