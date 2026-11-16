import type { Bucket, RateLimiter, RateLimitResult, TokenBucketOptions } from "./types.js";

export class TokenBucketLimiter implements RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly capacity: number;
  private readonly refillPerSec: number;
  private readonly now: () => number;

  constructor({ capacity, refillPerSec, now = Date.now }: TokenBucketOptions) {
    if (capacity <= 0 || refillPerSec <= 0) {
      throw new RangeError("capacity and refillPerSec must be positive");
    }
    this.capacity = capacity;
    this.refillPerSec = refillPerSec;
    this.now = now;
  }

  async allow(key: string, cost = 1): Promise<RateLimitResult> {
    if (cost > this.capacity) {
      throw new RangeError("cost exceeds bucket capacity");
    }
    const now = this.now();

    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.capacity, lastRefillAt: now }; // new key starts full
      this.buckets.set(key, bucket);
    } else {
      const elapsedSec = Math.max(0, now - bucket.lastRefillAt) / 1000; // guard against clock going backwards
      bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsedSec * this.refillPerSec);
      bucket.lastRefillAt = now;
    }

    if (bucket.tokens < cost) {
      const retryAfterMs = Math.ceil(((cost - bucket.tokens) / this.refillPerSec) * 1000);
      return {
        isAllowed: false,
        reason: "rate_limited",
        limit: this.capacity,
        retryAfterMs,
        resetAt: now + retryAfterMs,
      };
    }

    bucket.tokens -= cost;
    const msToFull = Math.ceil(((this.capacity - bucket.tokens) / this.refillPerSec) * 1000);
    return {
      isAllowed: true,
      limit: this.capacity,
      remaining: Math.floor(bucket.tokens),
      resetAt: now + msToFull,
    };
  }
}