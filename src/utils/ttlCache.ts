// utils/ttlCache.ts
// A tiny bounded cache with per-entry expiry. There are no timers: expiry is
// checked lazily when an entry is read. When the cache is full, the oldest
// inserted entry is evicted first.

type Entry<V> = { value: V; expiresAt: number };

export class TTLCache<K, V> {
  private readonly store = new Map<K, Entry<V>>();

  // maxEntries: hard cap on size; ttlMs: how long each entry stays valid.
  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  // Returns the cached value if present and not expired, otherwise undefined.
  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= this.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  // Stores a value, evicting the oldest entry if the cache is at capacity.
  set(key: K, value: V): void {
    // If the key already exists, delete it so re-insertion refreshes its order.
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }
    this.store.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }

  // Removes an entry if present.
  delete(key: K): void {
    this.store.delete(key);
  }

  // Current number of stored entries (may include not-yet-read expired ones).
  get size(): number {
    return this.store.size;
  }
}
