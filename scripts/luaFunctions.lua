#!lua name=ratelimiter_lib

local function token_bucket_allow(keys, args)
    local key = keys[1]
    local capacity = tonumber(args[1])
    local refill_per_sec = tonumber(args[2])
    local cost = tonumber(args[3])
    local now_ms = tonumber(args[4]) -- optional; '' means use Redis TIME

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

local function sliding_window_allow(keys, args)
    local key = keys[1]
    local capacity = tonumber(args[1])
    local window_ms = tonumber(args[2])
    local cost = tonumber(args[3])
    local now_ms = tonumber(args[4]) -- '' means use Redis TIME

    if now_ms == nil then
        local t = redis.call('TIME')
        now_ms = t[1] * 1000 + math.floor(t[2] / 1000)
    end

    local this_start = math.floor(now_ms / window_ms) * window_ms

    local state = redis.call('HMGET', key, 'windowStart', 'windowCount', 'prevWindowCount')
    local window_start = tonumber(state[1])
    local window_count = tonumber(state[2])
    local prev_window_count = tonumber(state[3])

    if window_start == nil then
        window_start = this_start
        window_count = 0
        prev_window_count = 0
    end

    local gap = math.floor((this_start - window_start) / window_ms)
    if gap == 1 then
        prev_window_count = window_count
        window_count = 0
        window_start = this_start
    elseif gap >= 2 then
        prev_window_count = 0
        window_count = 0
        window_start = this_start
    end

    local elapsed = now_ms - this_start
    local weighted = prev_window_count * (window_ms - elapsed) / window_ms + window_count
    local reset_at = this_start + window_ms
    local ttl_ms = 2 * window_ms + 1000

    if weighted + cost > capacity then
        local retry_after_ms
        if window_count + cost <= capacity then
            -- prev_window_count > 0 here, otherwise we would not be denied
            local f = (capacity - window_count - cost) / prev_window_count
            retry_after_ms = this_start + window_ms * (1 - f) - now_ms
        else
            local f = (capacity - cost) / window_count
            retry_after_ms = this_start + window_ms + window_ms * (1 - f) - now_ms
        end
        -- persist the roll-over, but never the denied cost
        redis.call('HSET', key, 'windowStart', window_start,
                   'windowCount', window_count, 'prevWindowCount', prev_window_count)
        redis.call('PEXPIRE', key, ttl_ms)
        return { 0, math.max(0, math.floor(capacity - weighted)),
                 math.ceil(retry_after_ms), reset_at }
    end

    window_count = window_count + cost
    redis.call('HSET', key, 'windowStart', window_start,
               'windowCount', window_count, 'prevWindowCount', prev_window_count)
    redis.call('PEXPIRE', key, ttl_ms)

    return { 1, math.max(0, math.floor(capacity - weighted - cost)), 0, reset_at }
end

redis.register_function('token_bucket_allow', token_bucket_allow)
redis.register_function('sliding_window_allow', sliding_window_allow)