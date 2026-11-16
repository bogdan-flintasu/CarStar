/**
 * Simple in-memory fixed-window rate limiter, keyed per bucket + client IP.
 *
 * Limits are per server process: they reset on restart and are not shared
 * between instances. Good enough for a single Node server; use a shared store
 * (Redis/Upstash) if the app is scaled horizontally.
 */

interface Window {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(key: string, now?: number): RateLimitResult;
  reset(): void;
}

const MAX_KEYS = 10_000;

export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const windows = new Map<string, Window>();

  function prune(now: number) {
    for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
    // Still too many live keys (e.g. spoofed IPs): drop the oldest entries.
    if (windows.size > MAX_KEYS) {
      const excess = windows.size - MAX_KEYS;
      let i = 0;
      for (const k of windows.keys()) {
        if (i++ >= excess) break;
        windows.delete(k);
      }
    }
  }

  return {
    check(key, now = Date.now()) {
      if (windows.size > MAX_KEYS) prune(now);
      let w = windows.get(key);
      if (!w || w.resetAt <= now) {
        w = { count: 0, resetAt: now + windowMs };
        windows.set(key, w);
      }
      w.count += 1;
      const allowed = w.count <= limit;
      return {
        allowed,
        remaining: Math.max(0, limit - w.count),
        retryAfterSeconds: allowed ? 0 : Math.ceil((w.resetAt - now) / 1000),
      };
    },
    reset() {
      windows.clear();
    },
  };
}

/**
 * Best-effort client IP. Takes the first X-Forwarded-For hop, which is only
 * trustworthy behind a proxy that overwrites the header (Vercel, nginx, ...).
 */
export function getClientIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  return headers.get('x-real-ip')?.trim().slice(0, 64) || 'unknown';
}

/** Shared limiters for the public endpoints. */
export const loginLimiter = createRateLimiter(10, 15 * 60 * 1000); // 10 attempts / 15 min
export const emailLimiter = createRateLimiter(5, 10 * 60 * 1000); // 5 emails / 10 min
export const configurationLimiter = createRateLimiter(30, 10 * 60 * 1000); // 30 saves / 10 min
