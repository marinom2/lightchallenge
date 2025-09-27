// extremely simple token bucket per-instance (stateless per deployment)
const buckets = new Map<string, { tokens: number; last: number }>()

export function ratelimit(bucketName: string, capacity = 10, refillMs = 60_000) {
  const now = Date.now()
  const b = buckets.get(bucketName) ?? { tokens: capacity, last: now }
  const elapsed = now - b.last
  if (elapsed >= refillMs) {
    b.tokens = capacity
    b.last = now
  }
  const allowed = b.tokens > 0
  if (allowed) b.tokens -= 1
  buckets.set(bucketName, b)
  return { allowed, tokens: b.tokens }
}