import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { memoize } from "../src/index.js";

describe("memoize", () => {
  it("caches results per argument", async () => {
    const fn = mock.fn(async (/** @type {number} */ n) => n * 2);
    const double = memoize(fn);

    assert.equal(await double(2), 4);
    assert.equal(await double(2), 4);
    assert.equal(await double(3), 6);
    assert.equal(fn.mock.callCount(), 2);
  });

  it("works with sync functions and returns a promise", async () => {
    const add = memoize((/** @type {number} */ a, /** @type {number} */ b) => a + b);
    const result = add(1, 2);
    assert.ok(result instanceof Promise);
    assert.equal(await result, 3);
  });

  it("shares in-flight calls", async () => {
    const fn = mock.fn(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return "data";
    });
    const load = memoize(fn);

    await Promise.all([load("x"), load("x"), load("x")]);
    assert.equal(fn.mock.callCount(), 1);
  });

  it("uses a custom key function", async () => {
    const fn = mock.fn(async (/** @type {{ id: number, extra?: string }} */ user) => user.id);
    const byId = memoize(fn, { key: (user) => user.id });

    await byId({ id: 1, extra: "a" });
    await byId({ id: 1, extra: "b" });
    assert.equal(fn.mock.callCount(), 1);
  });

  it("retries after a rejection by default", async () => {
    let calls = 0;
    const flaky = memoize(async () => {
      calls++;
      if (calls === 1) throw new Error("first call fails");
      return "ok";
    });

    await assert.rejects(flaky(), /first call fails/);
    await new Promise((r) => setImmediate(r)); // let the cleanup run
    assert.equal(await flaky(), "ok");
    assert.equal(calls, 2);
  });

  it("can cache errors when asked", async () => {
    const fn = mock.fn(async () => {
      throw new Error("bad");
    });
    const cached = memoize(fn, { cacheErrors: true });

    await assert.rejects(cached(), /bad/);
    await assert.rejects(cached(), /bad/);
    assert.equal(fn.mock.callCount(), 1);
  });

  it("exposes the underlying cache", async () => {
    const square = memoize(async (/** @type {number} */ n) => n * n, { maxSize: 2 });
    await square(1);
    await square(2);
    await square(3);
    assert.equal(square.cache.size, 2);
    square.cache.clear();
    assert.equal(square.cache.size, 0);
  });

  it("rejects non-functions", () => {
    // @ts-expect-error: testing bad input on purpose
    assert.throws(() => memoize(123), TypeError);
  });
});
