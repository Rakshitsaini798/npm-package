import { EventEmitter } from "node:events";

/**
 * @typedef {"expired" | "evicted" | "deleted" | "cleared"} EvictReason
 */

/**
 * @typedef {object} CacheOptions
 * @property {number} [maxSize=Infinity] Max entries before least-recently-used ones are evicted.
 * @property {number} [ttl=0] Default time-to-live in ms. 0 means entries never expire.
 * @property {number} [pruneInterval=0] If > 0, sweep expired entries every N ms (timer is unref'd).
 * @property {boolean} [updateAgeOnGet=false] Reset an entry's TTL whenever it is read.
 */

/**
 * @typedef {object} SetOptions
 * @property {number} [ttl] Override the default TTL for this entry (ms). 0 = never expire.
 */

/**
 * @template V
 * @typedef {object} Entry
 * @property {V} value
 * @property {number} ttl
 * @property {number} expiresAt  Timestamp in ms, or Infinity.
 */

/**
 * In-memory key/value cache with LRU eviction and TTL.
 *
 * Uses a Map, which keeps insertion order, so the first key is always the
 * least recently used one. Reads move a key to the end.
 *
 * Events:
 * - `"evict"` `(key, value, reason)` fires whenever an entry leaves the cache.
 *
 * @template K, V
 * @extends {EventEmitter}
 */
export class TTLCache extends EventEmitter {
  /** @type {Map<K, Entry<V>>} */
  #store = new Map();
  #maxSize;
  #ttl;
  #updateAgeOnGet;
  /** @type {NodeJS.Timeout | undefined} */
  #timer;
  #hits = 0;
  #misses = 0;

  /** @param {CacheOptions} [options] */
  constructor({ maxSize = Infinity, ttl = 0, pruneInterval = 0, updateAgeOnGet = false } = {}) {
    super();
    assertNonNegative("maxSize", maxSize);
    assertNonNegative("ttl", ttl);
    assertNonNegative("pruneInterval", pruneInterval);
    if (maxSize === 0) throw new RangeError("maxSize must be greater than 0");

    this.#maxSize = maxSize;
    this.#ttl = ttl;
    this.#updateAgeOnGet = updateAgeOnGet;

    if (pruneInterval > 0) {
      this.#timer = setInterval(() => this.prune(), pruneInterval);
      // Don't keep the Node.js process alive just for cache cleanup.
      this.#timer.unref();
    }
  }

  /** Number of entries, including expired ones not yet pruned. */
  get size() {
    return this.#store.size;
  }

  /**
   * Store a value.
   * @param {K} key
   * @param {V} value
   * @param {SetOptions} [options]
   * @returns {this}
   */
  set(key, value, { ttl = this.#ttl } = {}) {
    assertNonNegative("ttl", ttl);

    if (this.#store.has(key)) this.#store.delete(key); // refresh LRU position
    this.#store.set(key, { value, ttl, expiresAt: ttl > 0 ? Date.now() + ttl : Infinity });

    while (this.#store.size > this.#maxSize) {
      const oldestKey = /** @type {K} */ (this.#store.keys().next().value);
      this.#remove(oldestKey, "evicted");
    }
    return this;
  }

  /**
   * Read a value. Returns undefined if missing or expired.
   * @param {K} key
   * @returns {V | undefined}
   */
  get(key) {
    const entry = this.#live(key);
    if (!entry) {
      this.#misses++;
      return undefined;
    }

    this.#hits++;
    // Move to the end, so it becomes the most recently used.
    this.#store.delete(key);
    if (this.#updateAgeOnGet && entry.ttl > 0) entry.expiresAt = Date.now() + entry.ttl;
    this.#store.set(key, entry);
    return entry.value;
  }

  /**
   * Check for a live entry without affecting LRU order or stats.
   * @param {K} key
   */
  has(key) {
    return this.#live(key) !== undefined;
  }

  /**
   * Read a value without changing its LRU position.
   * @param {K} key
   * @returns {V | undefined}
   */
  peek(key) {
    return this.#live(key)?.value;
  }

  /**
   * Remaining TTL in ms. Infinity if it never expires, 0 if missing.
   * @param {K} key
   */
  ttlOf(key) {
    const entry = this.#live(key);
    if (!entry) return 0;
    return entry.expiresAt === Infinity ? Infinity : entry.expiresAt - Date.now();
  }

  /**
   * Get a value, or compute and store it if missing.
   * Concurrent callers for the same key share one in-flight computation.
   * @param {K} key
   * @param {(key: K) => V | Promise<V>} factory
   * @param {SetOptions} [options]
   * @returns {Promise<V>}
   */
  async getOrSet(key, factory, options) {
    if (this.has(key)) return /** @type {V} */ (this.get(key));

    const pending = this.#inflight.get(key);
    if (pending) return pending;

    const promise = (async () => {
      try {
        const value = await factory(key);
        this.set(key, value, options);
        return value;
      } finally {
        this.#inflight.delete(key);
      }
    })();

    this.#inflight.set(key, promise);
    return promise;
  }

  /** @type {Map<K, Promise<V>>} */
  #inflight = new Map();

  /**
   * @param {K} key
   * @returns {boolean} true if an entry was removed
   */
  delete(key) {
    if (!this.#store.has(key)) return false;
    this.#remove(key, "deleted");
    return true;
  }

  /** Remove every entry. */
  clear() {
    for (const key of [...this.#store.keys()]) this.#remove(key, "cleared");
  }

  /**
   * Remove all expired entries now.
   * @returns {number} how many were removed
   */
  prune() {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.#store) {
      if (entry.expiresAt <= now) {
        this.#remove(key, "expired");
        removed++;
      }
    }
    return removed;
  }

  /** Hit/miss statistics since creation. */
  stats() {
    const total = this.#hits + this.#misses;
    return {
      hits: this.#hits,
      misses: this.#misses,
      hitRate: total === 0 ? 0 : this.#hits / total,
      size: this.#store.size,
    };
  }

  /** Stop the prune timer. Call this when you're done with the cache. */
  dispose() {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
  }

  /** Iterate live [key, value] pairs, oldest first. */
  *entries() {
    for (const [key] of [...this.#store]) {
      const entry = this.#live(key);
      if (entry) yield /** @type {[K, V]} */ ([key, entry.value]);
    }
  }

  *keys() {
    for (const [key] of this.entries()) yield key;
  }

  *values() {
    for (const [, value] of this.entries()) yield value;
  }

  [Symbol.iterator]() {
    return this.entries();
  }

  /**
   * Return the entry if it exists and has not expired, removing it if it has.
   * @param {K} key
   */
  #live(key) {
    const entry = this.#store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.#remove(key, "expired");
      return undefined;
    }
    return entry;
  }

  /**
   * @param {K} key
   * @param {EvictReason} reason
   */
  #remove(key, reason) {
    const entry = this.#store.get(key);
    if (!entry) return;
    this.#store.delete(key);
    this.emit("evict", key, entry.value, reason);
  }
}

/**
 * @param {string} name
 * @param {number} value
 */
function assertNonNegative(name, value) {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative number`);
  }
}
