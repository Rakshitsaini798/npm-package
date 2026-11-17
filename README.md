# @rakshit798/ttl-cache

A zero-dependency in-memory cache for Node.js, written in plain JavaScript and shipped with TypeScript types.

- LRU eviction when `maxSize` is reached
- Default or per-key TTL, with optional automatic pruning
- `evict` events that tell you why an entry left (`expired`, `evicted`, `deleted`, `cleared`)
- `getOrSet()`: concurrent callers for the same key share one computation
- `memoize()` for async functions, so failed calls are retried instead of cached

## Install

```bash
npm install @rakshit798/ttl-cache
```

This package needs Node.js 20.19 or newer. It's an ES module, and it also works with `require()` on these Node versions.

## Usage

```javascript
import { TTLCache, memoize } from "@rakshit798/ttl-cache";

const cache = new TTLCache({
  maxSize: 500,
  ttl: 60_000,
  pruneInterval: 30_000
});

cache.set("user:1", { name: "Ada" });
cache.set("token", "abc", { ttl: 5_000 }); // per-key TTL

cache.get("user:1"); // { name: "Ada" }

cache.on("evict", (key, value, reason) => {
  console.log(key, reason);
});

// Compute once, share with concurrent callers
const user = await cache.getOrSet("user:2", (key) => db.findUser(key));

// Memoize an async function
const getWeather = memoize(
  (city) =>
    fetch(`https://api.example.com/${city}`).then((r) => r.json()),
  {
    ttl: 10 * 60_000
  }
);

await getWeather("Delhi"); // network
await getWeather("Delhi"); // cache
```

### Using CommonJS

```javascript
const { TTLCache } = require("@rakshit798/ttl-cache");
```

## API

### `new TTLCache(options?)`

| **Option**       | **Default** | **Description**                                |
| ---------------- | ----------- | ---------------------------------------------- |
| `maxSize`        | `Infinity`  | Max entries before LRU eviction                |
| `ttl`            | `0`         | Default TTL in ms (`0` means it never expires) |
| `pruneInterval`  | `0`         | Sweep expired entries every N ms (`0` = off)   |
| `updateAgeOnGet` | `false`     | Reset an entry's TTL each time it's read       |

**Methods:** `set(key, value, { ttl })`, `get(key)`, `peek(key)`, `has(key)`, `delete(key)`, `clear()`, `prune()`, `ttlOf(key)`, `getOrSet(key, factory, { ttl })`, `stats()`, `dispose()`, `entries()`, `keys()`, `values()`. The cache is also iterable.

**Event:** `"evict"` is called with `(key, value, reason)`.

### `memoize(fn, options?)`

| **Option**    | **Default**      | **Description**                         |
| ------------- | ---------------- | --------------------------------------- |
| `ttl`         | `0`              | How long results stay cached            |
| `maxSize`     | `1000`           | Max cached results                      |
| `key`         | `JSON.stringify` | Builds the cache key from the arguments |
| `cacheErrors` | `false`          | Also cache rejected calls               |

The returned function always returns a Promise. You can reach the underlying cache as `fn.cache`.

## Development

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm test
```

Run test coverage:

```bash
npm run test:coverage
```

Check TypeScript types:

```bash
npm run typecheck
```

Run the example:

```bash
npm run example
```

Run all checks:

```bash
npm run check
```

## Publishing

The package is published on npm as [`@rakshit798/ttl-cache`](https://www.npmjs.com/package/@rakshit798/ttl-cache).

For future releases:

1. Update the package code and README.
2. Run `npm run check` to verify everything.
3. Increase the package version using `npm version patch`.
4. Push the changes and version tag to GitHub:

```bash
git push
git push --follow-tags
```

5. Publish the new version:

```bash
npm publish --access public
```

For automated publishing, you can configure npm Trusted Publishing with your GitHub repository and a GitHub Actions workflow.

## Repository

[GitHub Repository](https://github.com/Rakshitsaini798/npm-package)

## License

MIT License

## Keywords

- [cache](https://www.npmjs.com/search?q=keywords:cache)
- [lru](https://www.npmjs.com/search?q=keywords:lru)
- [ttl](https://www.npmjs.com/search?q=keywords:ttl)
- [memoize](https://www.npmjs.com/search?q=keywords:memoize)
- [memory-cache](https://www.npmjs.com/search?q=keywords:memory-cache)
- [nodejs](https://www.npmjs.com/search?q=keywords:nodejs)