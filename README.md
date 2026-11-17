# @yourname/ttl-cache

A zero-dependency in-memory cache for Node.js, written in plain JavaScript and shipped with TypeScript types.

- LRU eviction when `maxSize` is reached
- Default or per-key TTL, with optional automatic pruning
- `evict` events that tell you why an entry left (`expired`, `evicted`, `deleted`, `cleared`)
- `getOrSet()`: concurrent callers for the same key share one computation
- `memoize()` for async functions, so failed calls are retried instead of cached

## Install

```bash
npm install @yourname/ttl-cache
```

This package needs Node.js 20.19 or newer. It's an ES module, and it also works with `require()` on these Node versions.

## Usage

```js
import { TTLCache, memoize } from "@yourname/ttl-cache";

const cache = new TTLCache({ maxSize: 500, ttl: 60_000, pruneInterval: 30_000 });

cache.set("user:1", { name: "Ada" });
cache.set("token", "abc", { ttl: 5_000 }); // per-key TTL
cache.get("user:1");                       // { name: "Ada" }

cache.on("evict", (key, value, reason) => console.log(key, reason));

// Compute once, share with concurrent callers
const user = await cache.getOrSet("user:2", (key) => db.findUser(key));

// Memoize an async function
const getWeather = memoize((city) => fetch(`https://api.example.com/${city}`).then((r) => r.json()), {
  ttl: 10 * 60_000,
});
await getWeather("Delhi"); // network
await getWeather("Delhi"); // cache
```

Using CommonJS:

```js
const { TTLCache } = require("@yourname/ttl-cache");
```

## API

### `new TTLCache(options?)`

| Option           | Default    | Description                                     |
| ---------------- | ---------- | ----------------------------------------------- |
| `maxSize`        | `Infinity` | Max entries before LRU eviction                 |
| `ttl`            | `0`        | Default TTL in ms (`0` means it never expires)  |
| `pruneInterval`  | `0`        | Sweep expired entries every N ms (`0` = off)    |
| `updateAgeOnGet` | `false`    | Reset an entry's TTL each time it's read        |

**Methods:** `set(key, value, { ttl })`, `get(key)`, `peek(key)`, `has(key)`, `delete(key)`, `clear()`, `prune()`, `ttlOf(key)`, `getOrSet(key, factory, { ttl })`, `stats()`, `dispose()`, `entries()`, `keys()`, `values()`. The cache is also iterable.

**Event:** `"evict"` is called with `(key, value, reason)`.

### `memoize(fn, options?)`

| Option        | Default          | Description                          |
| ------------- | ---------------- | ------------------------------------ |
| `ttl`         | `0`              | How long results stay cached         |
| `maxSize`     | `1000`           | Max cached results                   |
| `key`         | `JSON.stringify` | Builds the cache key from the arguments |
| `cacheErrors` | `false`          | Also cache rejected calls            |

The returned function always returns a Promise. You can reach the underlying cache as `fn.cache`.

## Development

```bash
npm install
npm test              # Node's built-in test runner
npm run test:coverage
npm run typecheck     # checks the JSDoc types
npm run example
npm run check         # everything that runs before publishing
```

## Publishing

1. Change `@yourname` and the GitHub URLs in `package.json` to your own.
2. Do the first publish from your machine: run `npm login`, then `npm publish`. Your npm account needs 2FA turned on.
3. On npmjs.com, open the package, go to **Settings → Trusted Publisher**, and add your repo with the workflow file `release.yml`.
4. To release a new version later: run `npm version patch`, then `git push --follow-tags`.

## License

MIT
