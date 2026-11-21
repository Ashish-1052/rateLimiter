import { Redis } from "ioredis"
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest"
import { RedisSlidingWindowLimiter } from "../src/redisSlidingWindow.js";

const redis = new Redis('redis://localhost:6380');

const limiters = Array.from({ length: 5 }, () =>
  new RedisSlidingWindowLimiter({ capacity: 10, windowMs: 10 * 1000, redis }));

beforeAll(() => {
  // guard: refuse to run against the wrong Redis
  if (redis.options.port !== 6380) {
    throw new Error("tests must run against the test Redis on 6380");
  }
});

beforeEach(async () => {
  await redis.flushdb(); // clean state before every test
});

afterAll(async () => {
  await redis.flushdb();
  await redis.quit();
});

test('should reject irrespective of instances being different', async () => {

  await redis.flushdb();
  
  const promises = [];
  const results = new Array(20).fill(0);
  for (let j = 0; j < 20; j++) {
    const key = `test${j}`; 
    for (let i = 0; i < 15; i++) {
      const limiter = limiters[i % limiters.length];
      promises.push(limiter.allow(key).then(res => {
        if (res.isAllowed) {
          results[j]++;
        }
      }));
    }
  }

  await Promise.all(promises);

  await redis.flushdb();
  expect(results).toEqual(new Array(20).fill(10));

})

