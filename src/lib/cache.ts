/**
 * In-memory TTL cache for API responses.
 * Survives within a single serverless function warm period on Vercel.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.timestamp > entry.ttl) {
    store.delete(key);
    return null;
  }
  return entry.data;
}

export function cacheSet<T>(key: string, data: T, ttlMs: number): void {
  store.set(key, { data, timestamp: Date.now(), ttl: ttlMs });
}

// TTL constants
export const TTL = {
  QUOTE: 60_000,        // 1 minute
  OPTIONS: 5 * 60_000,  // 5 minutes
  HISTORICAL: 60 * 60_000, // 1 hour
  VIX: 60_000,          // 1 minute
  SCANNER: 2 * 60_000,  // 2 minutes
} as const;
