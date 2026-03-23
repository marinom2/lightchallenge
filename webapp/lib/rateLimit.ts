/**
 * webapp/lib/rateLimit.ts
 *
 * In-memory sliding-window rate limiter for API routes.
 * No external dependencies (no Redis). Suitable for single-process deployments
 * and Vercel serverless (per-instance limits).
 */

type RateLimitConfig = {
  windowMs: number;   // time window in ms
  maxRequests: number; // max requests per window
};

type BucketEntry = {
  tokens: number;
  lastRefill: number;
};

/**
 * Creates a token-bucket rate limiter with sliding window semantics.
 * Tokens refill continuously based on elapsed time.
 */
export function rateLimit(config: RateLimitConfig): {
  check: (key: string) => { allowed: boolean; remaining: number; retryAfterMs: number };
  cleanup: () => void;
} {
  const buckets = new Map<string, BucketEntry>();

  // Auto-cleanup expired entries every 60s
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of buckets) {
      // If enough time has passed that the bucket would be fully refilled, remove it
      if (now - entry.lastRefill > config.windowMs) {
        buckets.delete(key);
      }
    }
  }, 60_000);

  // Prevent the timer from keeping the process alive
  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }

  function check(key: string): { allowed: boolean; remaining: number; retryAfterMs: number } {
    const now = Date.now();
    let entry = buckets.get(key);

    if (!entry) {
      entry = { tokens: config.maxRequests, lastRefill: now };
      buckets.set(key, entry);
    }

    // Refill tokens based on elapsed time (sliding window)
    const elapsed = now - entry.lastRefill;
    const refillRate = config.maxRequests / config.windowMs; // tokens per ms
    const refill = elapsed * refillRate;
    entry.tokens = Math.min(config.maxRequests, entry.tokens + refill);
    entry.lastRefill = now;

    if (entry.tokens >= 1) {
      entry.tokens -= 1;
      return {
        allowed: true,
        remaining: Math.floor(entry.tokens),
        retryAfterMs: 0,
      };
    }

    // Not enough tokens — calculate when 1 token will be available
    const deficit = 1 - entry.tokens;
    const retryAfterMs = Math.ceil(deficit / refillRate);

    return {
      allowed: false,
      remaining: 0,
      retryAfterMs,
    };
  }

  function cleanup() {
    clearInterval(cleanupTimer);
    buckets.clear();
  }

  return { check, cleanup };
}

// ── Pre-configured instances ─────────────────────────────────────────────────

/** 100 requests per minute — for webhook endpoints */
export const webhookLimiter = rateLimit({ windowMs: 60_000, maxRequests: 100 });

/** 10 requests per minute — for match submission */
export const submitMatchLimiter = rateLimit({ windowMs: 60_000, maxRequests: 10 });

/** 30 requests per minute — for match result reporting */
export const matchResultLimiter = rateLimit({ windowMs: 60_000, maxRequests: 30 });
