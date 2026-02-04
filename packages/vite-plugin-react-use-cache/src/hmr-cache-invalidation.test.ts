import { test, expect, describe } from "vitest";
import { createStorage } from "unstorage";
import { createUnstorageCache } from "./unstorage.ts";
import type { CacheEntry } from "./runtime.ts";

describe("HMR Cache Invalidation", () => {
  test("should clean up orphaned cache entries when file is edited (HMR)", async () => {
    const storage = createStorage();
    const cache = createUnstorageCache(storage);

    async function countCacheEntries(): Promise<number> {
      const keys = await storage.getKeys();
      return keys.filter((k) => k.startsWith("item-")).length;
    }

    await cache.setItem("v1-hash-user-alice", {
      encoded: '{"name":"Alice","version":1}',
      expires: Date.now() + 100000,
      tags: [],
      cacheLife: "default",
    });
    await cache.setItem("v1-hash-user-bob", {
      encoded: '{"name":"Bob","version":1}',
      expires: Date.now() + 100000,
      tags: [],
      cacheLife: "default",
    });

    expect(await countCacheEntries()).toBe(2);

    await cache.setItem("v2-hash-user-alice", {
      encoded: '{"name":"Alice","version":2}',
      expires: Date.now() + 100000,
      tags: [],
      cacheLife: "default",
    });
    await cache.setItem("v2-hash-user-bob", {
      encoded: '{"name":"Bob","version":2}',
      expires: Date.now() + 100000,
      tags: [],
      cacheLife: "default",
    });

    await cache.setItem("v3-hash-user-alice", {
      encoded: '{"name":"Alice","version":3}',
      expires: Date.now() + 100000,
      tags: [],
      cacheLife: "default",
    });
    await cache.setItem("v3-hash-user-bob", {
      encoded: '{"name":"Bob","version":3}',
      expires: Date.now() + 100000,
      tags: [],
      cacheLife: "default",
    });

    const totalEntries = await countCacheEntries();
    expect(totalEntries).toBe(2);
  });
});
