import { expect, test } from "vitest";
import { TokenBucketLimiter } from "../src/tokenBucket.js";

function setup(capacity = 100, refillPerSec = 5) {
  let t = 0;
  const limiter = new TokenBucketLimiter({ capacity, refillPerSec, now: () => t });
  return { limiter, advance: (ms: number) => { t += ms; }, now: () => t };
}

test('should allow first under capacity request', async () => {
  const { limiter } = setup();
  const res = await limiter.allow('test-123', 10);
  expect(res).toEqual({ isAllowed: true, limit: 100, remaining: 90, resetAt: 2000 })
})

test('should disallow after burst', async () => {
  const { limiter, advance } = setup(5, 1);

  const key = 'test-123'
  
  const res1 = await limiter.allow(key);
  expect(res1).toEqual({ isAllowed: true, limit: 5, remaining: 4, resetAt: 1000 });

  const res2 = await limiter.allow(key);
  expect(res2).toEqual({ isAllowed: true, limit: 5, remaining: 3, resetAt: 2000 })
  
  const res3 = await limiter.allow(key);
  expect(res3).toEqual({ isAllowed: true, limit: 5, remaining: 2, resetAt: 3000 })
  
  const res4 = await limiter.allow(key);
  expect(res4).toEqual({ isAllowed: true, limit: 5, remaining: 1, resetAt: 4000 })
  
  const res5 = await limiter.allow(key);
  expect(res5).toEqual({ isAllowed: true, limit: 5, remaining: 0, resetAt: 5000 })

  const res6 = await limiter.allow(key);
  expect(res6).toEqual({ isAllowed: false, reason: 'rate_limited', limit: 5, retryAfterMs: 1000, resetAt: 1000 });

  advance(5001);

  const res7 = await limiter.allow(key);
  expect(res7).toEqual({ isAllowed: true, limit: 5, remaining: 4, resetAt: 6001 })
  
})
test('should disallow after burst for fractional tokens', async () => {
  const { limiter, advance } = setup(5, 2);

  const key = 'test-123'
  
  const res1 = await limiter.allow(key);
  expect(res1).toEqual({ isAllowed: true, limit: 5, remaining: 4, resetAt: 500 });

  const res2 = await limiter.allow(key);
  expect(res2).toEqual({ isAllowed: true, limit: 5, remaining: 3, resetAt: 1000 })
  
  const res3 = await limiter.allow(key);
  expect(res3).toEqual({ isAllowed: true, limit: 5, remaining: 2, resetAt: 1500 })
  
  const res4 = await limiter.allow(key);
  expect(res4).toEqual({ isAllowed: true, limit: 5, remaining: 1, resetAt: 2000 })
  
  const res5 = await limiter.allow(key);
  expect(res5).toEqual({ isAllowed: true, limit: 5, remaining: 0, resetAt: 2500 })

  const res6 = await limiter.allow(key);
  expect(res6).toEqual({ isAllowed: false, reason: 'rate_limited', limit: 5, retryAfterMs: 500, resetAt: 500 });

  advance(200);

  const res7 = await limiter.allow(key);
  expect(res7).toEqual({ isAllowed: false, reason: 'rate_limited', limit: 5, retryAfterMs: 300, resetAt: 500 })

  advance(301);

  const res8 = await limiter.allow(key);
  expect(res8).toEqual({ isAllowed: true, limit: 5, remaining: 0, resetAt: 3000 });
  
})

test('should cap after burst', async () => {
  const { limiter, advance } = setup(5, 1);

  const key = 'test-123'
  
  const res1 = await limiter.allow(key);
  expect(res1).toEqual({ isAllowed: true, limit: 5, remaining: 4, resetAt: 1000 });

  const res2 = await limiter.allow(key);
  expect(res2).toEqual({ isAllowed: true, limit: 5, remaining: 3, resetAt: 2000 })
  
  const res3 = await limiter.allow(key);
  expect(res3).toEqual({ isAllowed: true, limit: 5, remaining: 2, resetAt: 3000 })
  
  const res4 = await limiter.allow(key);
  expect(res4).toEqual({ isAllowed: true, limit: 5, remaining: 1, resetAt: 4000 })
  
  const res5 = await limiter.allow(key);
  expect(res5).toEqual({ isAllowed: true, limit: 5, remaining: 0, resetAt: 5000 })

  const res6 = await limiter.allow(key);
  expect(res6).toEqual({ isAllowed: false, reason: 'rate_limited', limit: 5, retryAfterMs: 1000, resetAt: 1000 });

  advance(60000);

  const res7 = await limiter.allow(key);
  expect(res7).toEqual({ isAllowed: true, limit: 5, remaining: 4, resetAt: 61000 })
})

test('should isolate buckets for keys', async () => {
  const { limiter, advance } = setup(2, 1);

  const keya = 'test-a'
  const keyb = 'test-b'
  
  const resa1 = await limiter.allow(keya)
  expect(resa1).toEqual({ isAllowed: true, limit: 2, remaining: 1, resetAt: 1000 })
  const resa2 = await limiter.allow(keya)
  expect(resa2).toEqual({ isAllowed: true, limit: 2, remaining: 0, resetAt: 2000 })

  advance(1500);
  const resb1 = await limiter.allow(keyb);
  expect(resb1).toEqual({ isAllowed: true, limit: 2, remaining: 1, resetAt: 2500 })

  const resa3 = await limiter.allow(keya)
  expect(resa3).toEqual({ isAllowed: true, limit: 2, remaining: 0, resetAt: 3000 });
})