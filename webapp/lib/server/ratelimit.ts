type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

/**
 * In-memory fixed-window limiter
 * @param key logical key (e.g., "aivm-sign")
 * @param limit requests allowed per window
 * @param windowMs window size in ms
 */
export function ratelimit(key: string, limit = 20, windowMs = 60_000) {
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || now > bucket.resetAt) {
    const resetAt = now + windowMs
    const fresh: Bucket = { count: 1, resetAt }
    buckets.set(key, fresh)
    return { allowed: true, remaining: limit - 1, resetAt }
  } else {
    if (bucket.count < limit) {
      bucket.count += 1
      return { allowed: true, remaining: limit - bucket.count, resetAt: bucket.resetAt }
    } else {
      return { allowed: false, remaining: 0, resetAt: bucket.resetAt }
    }
  }
}
export default ratelimit
