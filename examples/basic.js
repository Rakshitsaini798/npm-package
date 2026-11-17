
import { TTLCache, memoize } from "../src/index.js";
const sessions = new TTLCache({ maxSize: 3, ttl: 2_000 });
sessions.on("evict", (key, _value, reason) => console.log(`evicted ${key} (${reason})`));

sessions.set("alice", { role: "admin" });
sessions.set("bob", { role: "user" });
sessions.set("carol", { role: "user" });
sessions.set("dave", { role: "user" }); 

console.log("bob:", sessions.get("bob"));
console.log("stats:", sessions.stats());


const fetchUser = memoize(
  async (id) => {
    console.log(`  fetching user ${id}...`);
    await new Promise((r) => setTimeout(r, 300));
    return { id, name: `User ${id}` };
  },
  { ttl: 5_000 },
);

console.time("first call");
await fetchUser(1);
console.timeEnd("first call");

console.time("cached call");
await fetchUser(1);
console.timeEnd("cached call");
