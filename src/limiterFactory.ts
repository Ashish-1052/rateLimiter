import { SlidingWindowLimiter } from "./slidingWindow.js";
import { TokenBucketLimiter } from "./tokenBucket.js";
import type { LimiterConfig, RateLimiter } from "./types.js";

export class LimiterFactory {
  static createLimiter(config: LimiterConfig, now: () => number = Date.now): RateLimiter {
    switch (config.algorithm) {
      case "slidingWindow":
        return new SlidingWindowLimiter({
          capacity: config.capacity,
          windowMs: config.windowMs,
          now,
        });
      case "tokenBucket":
        return new TokenBucketLimiter({
          capacity: config.capacity,
          refillPerSec: config.refillPerSec,
          now,
        });
    }
  }
}