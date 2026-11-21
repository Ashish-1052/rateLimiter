import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Redis } from "ioredis";
import type { RateLimiter, RateLimitResult, RedisTokenBucketOptions } from "./types.js";

const LUA_SOURCE = readFileSync(
  fileURLToPath(new URL("../scripts/luaFunctions.lua", import.meta.url)),
  "utf8",
);

export class RedisTokenBucketLimiter implements RateLimiter {
  private readonly redis: Redis;
  private readonly capacity: number;
  private readonly refillPerSec: number;
  private readonly now?: (() => number); // optional: no clock means Redis TIME is used
  private readonly keyPrefix = "ratelimit:tb:";
  private ready?: (Promise<unknown>) | undefined;
  private readonly failureMode: "open" | "closed";   // default "open"
  private readonly failureRetryAfterMs: number;      // default 1000, used when closed
  private readonly onError?: ((err: unknown) => void);

  constructor({ capacity, refillPerSec, now, redis, failureMode, failureRetryAfterMs, onError }: RedisTokenBucketOptions) {
    if (capacity <= 0 || refillPerSec <= 0) {
      throw new RangeError("capacity and refillPerSec must be positive");
    }
    this.redis = redis;
    this.capacity = capacity;
    this.refillPerSec = refillPerSec;
    if (now) {
      this.now = now;
    }
    this.failureMode = failureMode ?? "open";
    this.failureRetryAfterMs = failureRetryAfterMs ?? 1000;
    if (onError) {
      this.onError = onError;
    }
  }

  // Cache the promise so concurrent first calls share one FUNCTION LOAD.
  private ensureLoaded(): Promise<unknown> {
    this.ready ??= this.redis
      .call("FUNCTION", "LOAD", "REPLACE", LUA_SOURCE)
      .catch((err) => {
        this.ready = undefined; // allow a retry after a failed load
        throw err;
      });
    return this.ready;
  }

  async allow(key: string, cost: number = 1): Promise<RateLimitResult> {
    if (cost > this.capacity) {
      throw new RangeError("cost exceeds bucket capacity");
    }
    await this.ensureLoaded();
    try {
        return await this.execute(key, cost);
      } catch (err) {
        this.onError?.(err); // never swallow silently
        return this.fallback();
      }
  }

  private async execute(key: string, cost: number): Promise<RateLimitResult> {
    await this.ensureLoaded();
    try {
      return await this.callScript(key, cost);
    } catch (err) {
      if (err instanceof Error && err.message.includes("Function not found")) {
        this.ready = undefined;          // Redis lost the library, e.g. after a restart
        await this.ensureLoaded();
        return await this.callScript(key, cost);
      }
      throw err;
    }
  }

  private async callScript(key: string, cost: number = 1): Promise<RateLimitResult> {
    const nowArg = this.now ? String(this.now()) : ""; // "" tells Lua to use Redis TIME
    const redisKey = `${this.keyPrefix}${key}`;

    const [allowed, remaining, retryAfterMs, resetAt] = (await this.redis.fcall(
      "token_bucket_allow",
      1,
      redisKey,
      this.capacity,
      this.refillPerSec,
      cost,
      nowArg,
    )) as [number, number, number, number];

    if (allowed === 0) {
      return {
        isAllowed: false,
        reason: "rate_limited",
        limit: this.capacity,
        retryAfterMs,
        resetAt,
      };
    }

    return {
      isAllowed: true,
      limit: this.capacity,
      remaining,
      resetAt,
    };
  }

  private fallback(): RateLimitResult {
    const now = this.now?.() ?? Date.now();
    if (this.failureMode === "open") {
      return { isAllowed: true, limit: this.capacity, remaining: this.capacity, resetAt: now };
    }
    return {
      isAllowed: false,
      reason: "backend_unavailable",
      limit: this.capacity,
      retryAfterMs: this.failureRetryAfterMs,
      resetAt: now + this.failureRetryAfterMs,
    };
  }
}