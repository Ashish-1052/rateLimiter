# Distributed Rate Limiter

A rate limiting library and Express middleware written in TypeScript. It implements the **token bucket** and **sliding window** algorithms, each with an in-memory backend for single instances and a **Redis** backend that enforces limits across many app servers.

## Features

- **Two algorithms**
  - **Token bucket**: allows short bursts up to `capacity`, then refills at a steady `refillPerSec`.
  - **Sliding window**: weights the previous fixed window's count against the current one, which smooths out the traffic spikes that plain fixed windows allow at window edges.
- **Two backends**
  - **In-memory**: keeps state per key in a `Map` and periodically sweeps out idle keys so memory stays bounded.
  - **Redis**: runs each algorithm as a server-side **Redis Function written in Lua**, so the read-check-write happens atomically in one round trip. Limits hold even when many app instances hit the same key at once.
- **Correct under concurrency**: tests send concurrent requests through several limiter instances sharing one Redis and check that exactly `capacity` of them get through.
- **Resilient to Redis failures**
  - Configurable **fail-open** (let traffic through) or **fail-closed** (return `503`) behavior when Redis is unreachable, plus an `onError` hook so failures are never silent.
  - Reloads the Lua library automatically if Redis loses it, for example after a restart.
  - Uses Redis server time by default, so clock drift between app servers doesn't skew limits.
- **Standard HTTP semantics**: responds with `429 Too Many Requests` and `Retry-After`, and sets `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers.
- **Pluggable design**: every limiter implements one `RateLimiter` interface, a `LimiterFactory` builds one from config, and the middleware accepts a custom `keyFn` (per IP, per user, per route, and so on).
- **Testable by design**: limiters accept an injectable clock, so time-based behavior is tested deterministically without sleeping.

## Tech Stack

TypeScript · Node.js · Express 5 · Redis 7 (Functions / Lua) · ioredis · Vitest · Supertest · Docker Compose

## Architecture

```
Request ──► rateLimit middleware ──► RateLimiter.allow(key, cost)
                 │                         │
                 │               ┌─────────┴──────────┐
                 │          In-memory              Redis (Lua Function)
                 │      TokenBucket / SlidingWindow   token_bucket_allow
                 │                                    sliding_window_allow
                 ▼
        toHttpDecision() ──► 200 + headers | 429 + Retry-After | 503
```

| File | Purpose |
| --- | --- |
| `src/tokenBucket.ts`, `src/slidingWindow.ts` | In-memory limiters |
| `src/redisTokenBucket.ts`, `src/redisSlidingWindow.ts` | Redis-backed limiters with failure handling |
| `scripts/luaFunctions.lua` | Atomic Redis Functions for both algorithms |
| `src/limiterFactory.ts` | Builds a limiter from a typed config |
| `src/middleware.ts`, `src/http.ts` | Express middleware and the mapping from a limiter result to an HTTP response |
| `src/server.ts` | Demo server |

## Usage

```ts
import express from "express";
import { Redis } from "ioredis";
import { LimiterFactory } from "./src/limiterFactory.js";
import { rateLimit } from "./src/middleware.js";

const limiter = LimiterFactory.createLimiter({
  algorithm: "tokenBucket",
  capacity: 100,      // burst size
  refillPerSec: 50,   // sustained rate
  backend: "redis",
  redis: new Redis("redis://localhost:6380"),
});

const app = express();
app.use(rateLimit({ limiter, keyFn: (req) => req.ip ?? "unknown" }));
```

## Getting Started

```bash
pnpm install
pnpm redis:up                   # start Redis 7 on port 6380 via Docker
pnpm test:run                   # run the test suite

pnpm start                      # demo server, in-memory backend
BACKEND=redis pnpm start        # demo server, Redis backend
```

The demo server listens on port `3000` and exposes:

- `GET /health`
- `GET /hello`: generous limit (100 burst, 50/sec by default)
- `GET /login`: strict limit (5 burst, 1 token every 10 seconds)

```bash
curl -i localhost:3000/login    # repeat to see 429 and Retry-After
```

## Benchmarks

**Setup:** MacBook Air 13" (Apple M4, 16 GB). Two Node instances and one Redis 7.4 (Alpine, in Docker), all on the same machine. autocannon ran against both instances at the same time, with 50 connections per instance, for 30 s per run.

| Scenario | Combined throughput | p50 | p99 |
| --- | --- | --- | --- |
| No limiter (`/health`, per instance) | ~18k req/s | 2 ms | 6 ms |
| In-memory limiter, all allowed | ~27–28k req/s | 2 ms | 7–8 ms |
| Redis limiter, all allowed (median of 3 runs) | ~24k req/s | 3–4 ms | 8 ms |
| Redis limiter, mostly denied (`/login`) | ~20k req/s | 4 ms | 8–9 ms |

**Global enforcement under load.** `/login` uses a bucket of 5 tokens that refills at 0.1 tokens per second. Across four 30 s runs, with 100 concurrent connections spread over two instances, **no run allowed more than 8 requests**: the 5 initial tokens plus about 3 refilled. If each instance kept its own count, at least 10 would have gotten through.

> These numbers are for comparison only. They come from a single laptop where the load generator, both servers and Redis compete for the same cores, so they are not a production benchmark.

## Testing

- **Unit tests** run each limiter against an injected fake clock. They cover bursts, fractional refill, `retryAfterMs` accuracy, key isolation, and the sliding window's boundary-burst case.
- **Redis integration tests** run the same scenarios against a real Redis on port 6380, not a mock.
- **Concurrency tests** send simultaneous requests through several clients to confirm the Lua functions update state atomically.
- **Middleware tests** use Supertest to cover the allowed, `429` and `503` paths.
