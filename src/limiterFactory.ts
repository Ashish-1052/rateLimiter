import { RedisSlidingWindowLimiter } from "./redisSlidingWindow.js";
import { RedisTokenBucketLimiter } from "./redisTokenBucket.js";
import { SlidingWindowLimiter } from "./slidingWindow.js";
import { TokenBucketLimiter } from "./tokenBucket.js";
import type { LimiterConfig, RateLimiter } from "./types.js";

export class LimiterFactory {
  static createLimiter(config: LimiterConfig, now: () => number = Date.now): RateLimiter {
    switch (config.algorithm) {
      case "slidingWindow":
        if (config.backend === 'memory') {
          return new SlidingWindowLimiter({
            capacity: config.capacity,
            windowMs: config.windowMs,
            now,
          });
        }
        return new RedisSlidingWindowLimiter({
          capacity: config.capacity,
          windowMs: config.windowMs,
          now,
          redis: config.redis
        })
      case "tokenBucket":
        if (config.backend === 'memory') {
          return new TokenBucketLimiter({
            capacity: config.capacity,
            refillPerSec: config.refillPerSec,
            now,
          });
        }
        return new RedisTokenBucketLimiter({
          capacity: config.capacity,
          refillPerSec: config.refillPerSec,
          now,
          redis: config.redis
        })
    }
  }
}