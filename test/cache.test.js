import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { TTLCache } from "../src/index.js";

describe("TTLCache basics", () => {
  it("sets, gets, has and deletes", () => {
    const cache = new TTLCache();
    cache.set("a", 1);
    assert.equal(cache.get("a"), 1);
    assert.equal(cache.has("a"), true);
    assert.equal(cache.delete("a"), true);
    assert.equal(cache.get("a"), undefined);
    assert.equal(cache.delete("a"), false);
  });

  it("set() is chainable", () => {
    const cache = new TTLCache().set("a", 1).set("b", 2);
    assert.equal(cache.size, 2);
  });

  it("iterates live entries oldest first", () => {
    const cache = new TTLCache();
    cache.set("a", 1).set("b", 2).set("c", 3);
    assert.deepEqual([...cache], [["a", 1], ["b", 2], ["c", 3]]);
    assert.deepEqual([...cache.keys()], ["a", "b", "c"]);
    assert.deepEqual([...cache.values()], [1, 2, 3]);
  });

  it("validates options", () => {
    assert.throws(() => new TTLCache({ maxSize: 0 }), RangeError);
    assert.throws(() => new TTLCache({ ttl: -1 }), RangeError);
    assert.throws(() => new TTLCache().set("a", 1, { ttl: Number.NaN }), RangeError);
  });

  it("tracks hit/miss stats", () => {
    const cache = new TTLCache();
    cache.set("a", 1);
    cache.get("a");
    cache.get("a");
    cache.get("missing");
    assert.deepEqual(cache.stats(), { hits: 2, misses: 1, hitRate: 2 / 3, size: 1 });
  });
});

describe("LRU eviction", () => {
  it("evicts the least recently used entry", () => {
    const cache = new TTLCache({ maxSize: 2 });
    cache.set("a", 1).set("b", 2);
    cache.get("a"); // a is now most recent
    cache.set("c", 3); // evicts b

    assert.equal(cache.has("a"), true);
    assert.equal(cache.has("b"), false);
    assert.equal(cache.has("c"), true);
  });

  it("peek() does not change LRU order", () => {
    const cache = new TTLCache({ maxSize: 2 });
    cache.set("a", 1).set("b", 2);
    cache.peek("a");
    cache.set("c", 3); // a is still oldest, so it's evicted
    assert.equal(cache.has("a"), false);
  });

  it("emits evict events with a reason", () => {
    const cache = new TTLCache({ maxSize: 1 });
    /** @type {unknown[][]} */
    const events = [];
    cache.on("evict", (...args) => events.push(args));

    cache.set("a", 1).set("b", 2); // a evicted
    cache.delete("b");
    cache.set("c", 3);
    cache.clear();

    assert.deepEqual(events, [
      ["a", 1, "evicted"],
      ["b", 2, "deleted"],
      ["c", 3, "cleared"],
    ]);
  });
});

describe("TTL expiry", () => {
  beforeEach(() => mock.timers.enable({ apis: ["Date", "setInterval"] }));
  afterEach(() => mock.timers.reset());

  it("expires entries after the default ttl", () => {
    const cache = new TTLCache({ ttl: 1_000 });
    cache.set("a", 1);
    mock.timers.tick(999);
    assert.equal(cache.get("a"), 1);
    mock.timers.tick(1);
    assert.equal(cache.get("a"), undefined);
  });

  it("supports per-key ttl overrides", () => {
    const cache = new TTLCache({ ttl: 1_000 });
    cache.set("short", 1, { ttl: 100 });
    cache.set("forever", 2, { ttl: 0 });
    mock.timers.tick(5_000);
    assert.equal(cache.has("short"), false);
    assert.equal(cache.get("forever"), 2);
    assert.equal(cache.ttlOf("forever"), Infinity);
  });

  it("reports remaining ttl", () => {
    const cache = new TTLCache({ ttl: 1_000 });
    cache.set("a", 1);
    mock.timers.tick(400);
    assert.equal(cache.ttlOf("a"), 600);
    assert.equal(cache.ttlOf("missing"), 0);
  });

  it("updateAgeOnGet refreshes ttl on read", () => {
    const cache = new TTLCache({ ttl: 1_000, updateAgeOnGet: true });
    cache.set("a", 1);
    mock.timers.tick(800);
    cache.get("a");
    mock.timers.tick(800);
    assert.equal(cache.get("a"), 1);
  });

  it("prune() removes expired entries and emits 'expired'", () => {
    const cache = new TTLCache({ ttl: 100 });
    const reasons = /** @type {string[]} */ ([]);
    cache.on("evict", (_k, _v, reason) => reasons.push(reason));

    cache.set("a", 1).set("b", 2).set("c", 3, { ttl: 0 });
    mock.timers.tick(100);

    assert.equal(cache.prune(), 2);
    assert.equal(cache.size, 1);
    assert.deepEqual(reasons, ["expired", "expired"]);
  });

  it("pruneInterval sweeps automatically", () => {
    const cache = new TTLCache({ ttl: 100, pruneInterval: 50 });
    cache.set("a", 1);
    mock.timers.tick(150);
    assert.equal(cache.size, 0);
    cache.dispose();
  });
});

describe("getOrSet", () => {
  it("computes once and caches the value", async () => {
    const cache = new TTLCache();
    const factory = mock.fn(async (/** @type {string} */ key) => key.toUpperCase());

    assert.equal(await cache.getOrSet("a", factory), "A");
    assert.equal(await cache.getOrSet("a", factory), "A");
    assert.equal(factory.mock.callCount(), 1);
  });

  it("dedupes concurrent calls for the same key", async () => {
    const cache = new TTLCache();
    const factory = mock.fn(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return 42;
    });

    const results = await Promise.all([1, 2, 3].map(() => cache.getOrSet("k", factory)));
    assert.deepEqual(results, [42, 42, 42]);
    assert.equal(factory.mock.callCount(), 1);
  });

  it("does not cache failures", async () => {
    const cache = new TTLCache();
    await assert.rejects(cache.getOrSet("k", async () => Promise.reject(new Error("nope"))), /nope/);
    assert.equal(cache.has("k"), false);
    assert.equal(await cache.getOrSet("k", () => "ok"), "ok");
  });
});
