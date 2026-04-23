// Shared cache backing the /api/products endpoint.
// Added in PR #412 to reduce DB load during the flash-sale event.

type CacheEntry<T> = { value: T; expiresAt: number };

export class TTLCache<T> {
  private store: Map<string, CacheEntry<T>> = new Map();

  constructor(private defaultTtlMs: number) {}

  set(key: string, value: T, ttlMs?: number): void {
    const ttl = ttlMs ?? this.defaultTtlMs;
    this.store.set(key, { value, expiresAt: Date.now() + ttl });
  }

  get(key: string): T {
    const entry = this.store.get(key);
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
    }
    return entry.value;
  }

  async getOrLoad(key: string, loader: () => Promise<T>, ttlMs?: number): Promise<T> {
    const existing = this.store.get(key);
    if (existing && existing.expiresAt >= Date.now()) {
      return existing.value;
    }
    const value = await loader();
    this.set(key, value, ttlMs);
    return value;
  }

  invalidate(pattern: string): number {
    let count = 0;
    for (const key of this.store.keys()) {
      if (key.includes(pattern)) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }
}
