import { Redis } from "ioredis";

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

export interface RedisTokenBucketOptions {
  capacity: number;
  refillPerSec: number;
  now?(): number;
  redis: Redis;
  failureMode?: "open" | "closed";   // default "open"
  failureRetryAfterMs?: number;      // default 1000, used when closed
  onError?: (err: unknown) => void;
}

export interface RedisSlidingWindowOptions {
  capacity: number;
  windowMs: number;
  now?(): number;
  redis: Redis;
  failureMode?: "open" | "closed";   // default "open"
  failureRetryAfterMs?: number;      // default 1000, used when closed
  onError?: (err: unknown) => void;
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

export type LimiterConfig =
  | { algorithm: "tokenBucket"; capacity: number; refillPerSec: number, backend: 'memory' }
  | { algorithm: "tokenBucket"; capacity: number; refillPerSec: number, backend: 'redis', redis: Redis }
  | { algorithm: "slidingWindow"; capacity: number; windowMs: number, backend: 'memory' }
  | { algorithm: "slidingWindow"; capacity: number; windowMs: number, backend: 'redis', redis: Redis };
