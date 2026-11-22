import express from "express";
import { Redis } from "ioredis";
import { LimiterFactory } from "./limiterFactory.js";
import { rateLimit } from "./middleware.js";

const PORT = Number(process.env.PORT ?? 3000);
const BACKEND = (process.env.BACKEND ?? "memory") as "memory" | "redis";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6380";

if (BACKEND !== "memory" && BACKEND !== "redis") {
  throw new Error(`BACKEND must be "memory" or "redis", got "${BACKEND}"`);
}

const redis =
  BACKEND === "redis"
    ? new Redis(REDIS_URL, { commandTimeout: 100, maxRetriesPerRequest: 1 })
    : undefined;

// helper so both limiters are built the same way
const build = (algorithm: "tokenBucket", capacity: number, refillPerSec: number) =>
  LimiterFactory.createLimiter(
    BACKEND === "redis"
      ? { algorithm, capacity, refillPerSec, backend: "redis", redis: redis! }
      : { algorithm, capacity, refillPerSec, backend: "memory" },
  );

const HELLO_CAPACITY = Number(process.env.HELLO_CAPACITY ?? 100);
const HELLO_REFILL = Number(process.env.HELLO_REFILL ?? 50);

const helloLimiter = build("tokenBucket", HELLO_CAPACITY, HELLO_REFILL);

const strictLimiter = build("tokenBucket", 5, 0.1);

const app = express();

app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/hello", rateLimit({ limiter: helloLimiter, keyFn: () => "hello" }), (_req, res) =>
  res.json({ message: "hello" }));
app.get("/login", rateLimit({ limiter: strictLimiter, keyFn: () => "login" }), (_req, res) =>
  res.json({ message: "login" }));

const server = app.listen(PORT, () => console.log(`listening on ${PORT} (${BACKEND})`));

const shutdown = async () => {
  server.close();
  await redis?.quit();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);