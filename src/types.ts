// src/types.ts
export type RateLimitResult =
  | {
      isAllowed: true;
      limit: number;
      remaining: number;
      resetAt: number; // epoch ms
    }
  | {
      isAllowed: false;
      reason: 'rate_limited' | 'backend_unavailable';
      limit: number;
      retryAfterMs: number;
      resetAt: number; // epoch ms
  };

export type Bucket = { tokens: number, lastRefillAt: number };

export interface RateLimiter {
  allow(key: string, cost?: number): Promise<RateLimitResult>;
}

export interface TokenBucketOptions {
  capacity: number;
  refillPerSec: number;
  now?(): number;
}

export interface SlidingWindowOptions {
  windowMs: number;
  capacity: number;
  now?: () => number;
}

export interface Window {
  windowStart: number, // date
  windowCount: number,
  prevWindowCount: number,
}