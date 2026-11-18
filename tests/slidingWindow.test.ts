import { expect, test, describe } from "vitest";
import { SlidingWindowLimiter } from "../src/slidingWindow.js";

function setup(capacity = 100, windowMs = 1000) {
  let t = 0;
  const limiter = new SlidingWindowLimiter({ windowMs, now: () => t, capacity });
  return { limiter, advance: (ms: number) => t += ms, now: () => t };
}

test('should fill and deny', async () => {
  const { limiter, advance } = setup(3);
  const key = 'test-123';

  const res1 = await limiter.allow(key);
  expect(res1).toEqual({ isAllowed: true, limit: 3, remaining: 2, resetAt: 1000 });
  
  const res2 = await limiter.allow(key);
  expect(res2).toEqual({ isAllowed: true, limit: 3, remaining: 1, resetAt: 1000 });
  
  const res3 = await limiter.allow(key);
  expect(res3).toEqual({ isAllowed: true, limit: 3, remaining: 0, resetAt: 1000 });
  
  const res4 = await limiter.allow(key);
  expect(res4).toMatchObject({ isAllowed: false, retryAfterMs: 1334 });

  advance(1000);
  
  const res5 = await limiter.allow(key);
  expect(res5).toMatchObject({ isAllowed: false, retryAfterMs: 334 });

  advance(334);

  const res6 = await limiter.allow(key);
  expect(res6.isAllowed).toBe(true); 
  
})

test('boundary burst', async () => {
  const { limiter, advance, now } = setup(5);
  const key = 'test-123';
  
  const res1 = await limiter.allow(key);
  expect(res1).toEqual({ isAllowed: true, limit: 5, remaining: 4, resetAt: 1000 });

  advance(900);

  const res2 = await limiter.allow(key);
  expect(res2).toEqual({ isAllowed: true, limit: 5, remaining: 3, resetAt: 1000 });
  
  const res3 = await limiter.allow(key);
  expect(res3).toEqual({ isAllowed: true, limit: 5, remaining: 2, resetAt: 1000 });
  
  const res4 = await limiter.allow(key);
  expect(res4).toEqual({ isAllowed: true, limit: 5, remaining: 1, resetAt: 1000 });

  const res5 = await limiter.allow(key);
  expect(res5).toEqual({ isAllowed: true, limit: 5, remaining: 0, resetAt: 1000 });

  advance(100); // t = 1000
  
  const res6 = await limiter.allow(key);
  expect(res6).toMatchObject({ isAllowed: false, retryAfterMs: 200 })

  advance(100) // t = 1100;
  
  const res7 = await limiter.allow(key);
  expect(res7).toMatchObject({ isAllowed: false, retryAfterMs: 100 })
  
  advance(100) // t = 1200;
  
  const res8 = await limiter.allow(key);
  expect(res8).toMatchObject({ isAllowed: true, resetAt: 2000 })

})


test('partial decay', async () => {
  const { limiter, advance } = setup(5);
  const key = 'test-123'
  
  await limiter.allow(key);
  advance(100);
  await limiter.allow(key);
  await limiter.allow(key);
  await limiter.allow(key);
  await limiter.allow(key);

  advance(1400);
  const res = await limiter.allow(key);
  expect(res).toMatchObject({ isAllowed: true, remaining: 1, resetAt: 2000 });
})

test('idle gap reset', async () => {
  const { limiter, advance } = setup(5);
  const key = 'test-123'
  
  await limiter.allow(key);
  advance(100);
  await limiter.allow(key);
  await limiter.allow(key);
  await limiter.allow(key);
  await limiter.allow(key);

  advance(2400);
  const res = await limiter.allow(key);
  expect(res).toMatchObject({ isAllowed: true, remaining: 4, resetAt: 3000 });
  const res2 = await limiter.allow(key);
  expect(res2).toMatchObject({ isAllowed: true, remaining: 3, resetAt: 3000 });
})

