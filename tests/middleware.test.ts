import { expect, test } from "vitest";
import { rateLimit } from "../src/middleware.js";
import type { RateLimiter } from "../src/types.js";
import express from "express"
import { TokenBucketLimiter } from "../src/tokenBucket.js";
import request from "supertest";

function makeApp(limiter: RateLimiter) {
  const app = express()
  app.use(rateLimit({ limiter, keyFn: () => "test123" }))
  app.get("/ping", (req, res) => res.json({ ok: true }))
  return app;
}

test('allows then returns 429', async () => {
  let t = 0;
  const limiter = new TokenBucketLimiter({ capacity: 2, refillPerSec: 1, now: () => t });
  const app = makeApp(limiter);

  const res1 = await request(app).get("/ping");
  expect(res1.status).toBe(200);
  expect(res1.headers["x-ratelimit-remaining"]).toBe("1");

  await request(app).get("/ping");

  const res2 = await request(app).get("/ping");
  expect(res2.status).toBe(429);
  expect(res2.headers["retry-after"]).toBe("1");
})

test('redis down returns 503', async () => {
  const down = {
    allow: async () => ({
      isAllowed: false as const,
      reason: "backend_unavailable" as const,
      limit: 5,
      retryAfterMs: 1000,
      resetAt: 1000,
    }),
  };
  
  const res = await request(makeApp(down)).get("/ping");
  expect(res.status).toBe(503);
  expect(res.headers["x-ratelimit-limit"]).toBeUndefined();
})