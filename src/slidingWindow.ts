import type { RateLimiter, RateLimitResult, SlidingWindowOptions, Window } from "./types.js";

export class SlidingWindow implements RateLimiter {
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly windows = new Map<string, Window>();
  private readonly capacity: number;
  private lastSweepAt: number;
  private readonly sweepThreshold: number;

  constructor({ windowMs, now = Date.now, capacity }: SlidingWindowOptions) {
    if (windowMs <= 0 || capacity <= 0) {
      throw new RangeError("windowMs and capacity must be positive");
    }
    this.windowMs = windowMs;
    this.now = now;
    this.capacity = capacity;
    this.lastSweepAt = now();
    this.sweepThreshold = 2 * windowMs;
  }

  async allow(key: string, cost: number = 1): Promise<RateLimitResult> {
    if (cost > this.capacity) {
      throw new RangeError("cost exceeds capacity");
    }
    const W = this.windowMs;
    const now = this.now();
    this.sweep(now);
    const thisStart = Math.floor(now / W) * W;

    let w = this.windows.get(key);
    if (!w) {
      w = { windowStart: thisStart, windowCount: 0, prevWindowCount: 0 };
      this.windows.set(key, w);
    }

    // 1. catch the stored snapshot up to now
    const gap = Math.floor((thisStart - w.windowStart) / W);
    if (gap === 1) {
      w.prevWindowCount = w.windowCount;
      w.windowCount = 0;
      w.windowStart = thisStart;
    } else if (gap >= 2) {
      w.prevWindowCount = 0;
      w.windowCount = 0;
      w.windowStart = thisStart;
    }

    // 2. sliding estimate (read-only, never stored)
    const elapsed = now - thisStart;
    const weighted = (w.prevWindowCount * (W - elapsed)) / W + w.windowCount;
    const resetAt = thisStart + W; // same meaning on both branches

    // 3. decide
    if (weighted + cost > this.capacity) {
      let retryAfterMs: number;
      if (w.windowCount + cost <= this.capacity) {
        // Fits once prev's weight decays enough inside THIS window.
        // Need prev * f <= capacity - current - cost, where f = (W - e) / W.
        const f = (this.capacity - w.windowCount - cost) / w.prevWindowCount;
        retryAfterMs = thisStart + W * (1 - f) - now;
      } else {
        // Current window alone is too full. Wait for the next window, where
        // today's count becomes "prev", then for its weight to decay.
        const f = (this.capacity - cost) / w.windowCount;
        retryAfterMs = thisStart + W + W * (1 - f) - now;
      }
      return {
        isAllowed: false,
        reason: "rate_limited",
        limit: this.capacity,
        retryAfterMs: Math.ceil(retryAfterMs),
        resetAt,
      };
    }

    w.windowCount += cost;
    return {
      isAllowed: true,
      limit: this.capacity,
      remaining: Math.max(0, Math.floor(this.capacity - weighted - cost)),
      resetAt,
    };
  }

  sweep(now: number): void {
    if ((now - this.lastSweepAt) < this.sweepThreshold) return;
    const thisStart = Math.floor(now / this.windowMs) * this.windowMs;
    for (const [key, w] of this.windows) {
      const gap = Math.floor((thisStart - w.windowStart) / this.windowMs);
      if (gap >= 2) {
        this.windows.delete(key);
      }
    }
    this.lastSweepAt = now;
  }
}