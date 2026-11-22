import type { HttpResult, RateLimitResult } from "./types.js";

export function toHttpDecision(result: RateLimitResult): HttpResult {
  if (result.isAllowed) {
    return {
      status: 200,
      headers: {
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
      },
    };
  }

  const retryAfter = String(Math.ceil(result.retryAfterMs / 1000));

  if (result.reason === "backend_unavailable") {
    return {
      status: 503,
      headers: { "Retry-After": retryAfter },
      body: { error: "Service Unavailable", reason: result.reason },
    };
  }

  return {
    status: 429,
    headers: {
      "X-RateLimit-Limit": String(result.limit),
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
      "Retry-After": retryAfter,
    },
    body: { error: "Too Many Requests", reason: result.reason },
  };
}