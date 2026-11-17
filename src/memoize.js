import { TTLCache } from "./cache.js";

/**
 * @typedef {object} MemoizeOptions
 * @property {number} [ttl=0] How long results stay cached (ms). 0 = forever.
 * @property {number} [maxSize=1000] Max cached results.
 * @property {(...args: any[]) => unknown} [key] Build the cache key from the arguments. Defaults to JSON.stringify(args).
 * @property {boolean} [cacheErrors=false] Also cache rejected promises.
 */

/**
 * Wrap an async (or sync) function so repeated calls with the same arguments
 * reuse the earlier result. Concurrent calls share one in-flight promise.
 *
 * @template {(...args: any[]) => any} F
 * @param {F} fn
 * @param {MemoizeOptions} [options]
 * @returns {((...args: Parameters<F>) => Promise<Awaited<ReturnType<F>>>) & { cache: TTLCache<unknown, Promise<Awaited<ReturnType<F>>>> }}
 */
export function memoize(fn, { ttl = 0, maxSize = 1000, key = defaultKey, cacheErrors = false } = {}) {
  if (typeof fn !== "function") throw new TypeError("memoize expects a function");

  /** @type {TTLCache<unknown, Promise<Awaited<ReturnType<F>>>>} */
  const cache = new TTLCache({ ttl, maxSize });

  /** @param {Parameters<F>} args */
  const memoized = (...args) => {
    const k = key(...args);
    const hit = cache.get(k);
    if (hit) return hit;

    const promise = Promise.resolve().then(() => fn(...args));
    cache.set(k, promise);

    if (!cacheErrors) {
      // Forget failures, so the next call tries again.
      promise.catch(() => {
        if (cache.peek(k) === promise) cache.delete(k);
      });
    }
    return promise;
  };

  return Object.assign(memoized, { cache });
}

/** @param {unknown[]} args */
function defaultKey(...args) {
  return args.length === 1 && isPrimitive(args[0]) ? args[0] : JSON.stringify(args);
}

/** @param {unknown} v */
function isPrimitive(v) {
  return v === null || (typeof v !== "object" && typeof v !== "function");
}
