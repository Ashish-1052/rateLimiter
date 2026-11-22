import { expect, test } from "vitest";
import type { LimiterConfig } from "../src/types.js";
import { LimiterFactory } from "../src/limiterFactory.js";

function setup(config: LimiterConfig) {
  let t = 0;
  const limiter = LimiterFactory.createLimiter(config, () => t);
  return { limiter, advance: (ms: number) => t += ms, now: () => t };
}

test('should return bucket limiter', async () => {
  const { limiter: limiterBucket, advance: advanceBucket, now: nowBucket } = setup({ algorithm: 'tokenBucket', capacity: 5, refillPerSec: 2, backend: 'memory' });
  const { limiter: limiterSlidingWindow, advance: advanceSlidingWindow, now: nowSlidingWindow } = setup({ algorithm: 'slidingWindow', capacity: 5, windowMs: 1000, backend: 'memory' });

  const key = 'test-123';

  await limiterBucket.allow(key) // t = 0
  advanceBucket(100);
  await limiterBucket.allow(key)
  await limiterBucket.allow(key)
  await limiterBucket.allow(key)
  await limiterBucket.allow(key)

  const res1 = await limiterBucket.allow(key);
  expect(res1).toMatchObject({ isAllowed: false, retryAfterMs: 400 });

  advanceBucket(500); // t = 600

  const res2 = await limiterBucket.allow(key);
  expect(res2).toMatchObject({ isAllowed: true, remaining: 0 });


  await limiterSlidingWindow.allow(key); // t = 0
  advanceSlidingWindow(100);
  await limiterSlidingWindow.allow(key);
  await limiterSlidingWindow.allow(key);
  await limiterSlidingWindow.allow(key);
  await limiterSlidingWindow.allow(key);

  const res3 = await limiterSlidingWindow.allow(key);
  expect(res3).toMatchObject({ isAllowed: false, resetAt: 1000 });

  advanceSlidingWindow(1200);
  const res4 = await limiterSlidingWindow.allow(key);
  expect(res4).toMatchObject({ isAllowed: true, remaining: 0, resetAt: 2000 });
  
})