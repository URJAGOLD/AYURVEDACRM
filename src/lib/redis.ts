/**
 * Cache abstraction. REDIS_URL set -> ioredis; otherwise in-memory fallback.
 * Used mainly to cache the Shiprocket auth token (~10 day validity).
 */
import Redis from "ioredis";

interface Cache {
  get(k: string): Promise<string | null>;
  set(k: string, v: string, ttl?: number): Promise<void>;
  del(k: string): Promise<void>;
}

class MemoryCache implements Cache {
  private s = new Map<string, { v: string; e: number }>();
  async get(k: string) { const x = this.s.get(k); if (!x) return null; if (x.e && x.e < Date.now()) { this.s.delete(k); return null; } return x.v; }
  async set(k: string, v: string, ttl = 0) { this.s.set(k, { v, e: ttl ? Date.now() + ttl * 1000 : 0 }); }
  async del(k: string) { this.s.delete(k); }
}
class RedisCache implements Cache {
  constructor(private c: Redis) {}
  async get(k: string) { return this.c.get(k); }
  async set(k: string, v: string, ttl = 0) { if (ttl) await this.c.set(k, v, "EX", ttl); else await this.c.set(k, v); }
  async del(k: string) { await this.c.del(k); }
}

const g = globalThis as unknown as { __cache?: Cache };
function build(): Cache {
  const url = process.env.REDIS_URL;
  if (url) {
    try { const c = new Redis(url, { maxRetriesPerRequest: 2 }); c.on("error", e => console.error("[redis]", e.message)); return new RedisCache(c); }
    catch { console.warn("[redis] failed, using memory cache"); }
  }
  return new MemoryCache();
}
export const cache: Cache = g.__cache ?? build();
if (process.env.NODE_ENV !== "production") g.__cache = cache;