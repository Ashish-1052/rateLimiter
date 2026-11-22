import { toHttpDecision } from "./http.js";
import type { RateLimitOptions } from "./types.js";
import type { Request, Response, NextFunction } from "express"

export function rateLimit({ limiter, keyFn = (req) => req.ip ?? 'unknown' }: RateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await limiter.allow(keyFn(req));
      const d = toHttpDecision(result);
      res.set(d.headers);
      if (result.isAllowed) return next();
      res.status(d.status).json(d.body);
    } catch (err) {
      next(err);
    }
  };
}