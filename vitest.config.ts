import { defineConfig } from "vitest/config";

// Redis tests share one Redis and call flushdb, so run files one at a time.
export default defineConfig({ test: { fileParallelism: false } });
