#!lua name=ratelimiter_lib

local function token_bucket_allow(keys, args)
    local key = keys[1]
    local capacity = tonumber(args[1])
    local refill_per_sec = tonumber(args[2])
    local cost = tonumber(args[3])
    local now_ms = tonumber(args[4])   -- optional; '' means use Redis TIME

    if now_ms == nil then
        local t = redis.call('TIME')
        now_ms = t[1] * 1000 + math.floor(t[2] / 1000) -- { seconds, microseconds }
    end

    local state = redis.call('HMGET', key, 'tokens', 'lastRefillAt')
    local tokens = tonumber(state[1])
    local last = tonumber(state[2])

    if tokens == nil then
        tokens = capacity
    else
        local elapsed_sec = math.max(0, now_ms - last) / 1000
        tokens = math.min(capacity, tokens + elapsed_sec * refill_per_sec)
    end

    if tokens < cost then
        local retry = math.ceil((cost - tokens) / refill_per_sec * 1000)
        local to_full = math.ceil((capacity - tokens) / refill_per_sec * 1000)
        -- { allowed, remaining, retryAfterMs, resetAt }
        return { 0, math.floor(tokens), retry, now_ms + to_full }
    end

    tokens = tokens - cost
    local to_full = math.ceil((capacity - tokens) / refill_per_sec * 1000)
    local ttl_ms = math.ceil(capacity / refill_per_sec * 1000)

    redis.call('HSET', key, 'tokens', tostring(tokens), 'lastRefillAt', tostring(now_ms))
    redis.call('PEXPIRE', key, ttl_ms)

    return { 1, math.floor(tokens), 0, now_ms + to_full }
end

redis.register_function('token_bucket_allow', token_bucket_allow)