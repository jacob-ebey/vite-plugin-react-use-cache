import { test, expect, describe } from "vitest";
import { createStorage } from "unstorage";
import { createUnstorageCache } from "./unstorage.ts";
import type { CacheEntry } from "./runtime.ts";

describe("HMR Cache Invalidation", () => {
  test("should clean up orphaned cache entries when file is edited (HMR)", async () => {
    const storage = createStorage();
    const cache = createUnstorageCache(storage);
    const fileId = "/src/data.tsx";

    async function countCacheEntries(): Promise<number> {
      const keys = await storage.getKeys();
      return keys.filter((k) => k.startsWith("item-")).length;
    }

    await cache.setItem("v1-hash-user-alice", {
      encoded: '{"name":"Alice","version":1}',
      expires: Date.now() + 100000,
      tags: [],
      cacheLife: "default",
      fileId,
    });
    await cache.setItem("v1-hash-user-bob", {
      encoded: '{"name":"Bob","version":1}',
      expires: Date.now() + 100000,
      tags: [],
      cacheLife: "default",
      fileId,
    });

    expect(await countCacheEntries()).toBe(2);

    await cache.invalidateByFileId(fileId);

    await cache.setItem("v2-hash-user-alice", {
      encoded: '{"name":"Alice","version":2}',
      expires: Date.now() + 100000,
      tags: [],
      cacheLife: "default",
      fileId,
    });
    await cache.setItem("v2-hash-user-bob", {
      encoded: '{"name":"Bob","version":2}',
      expires: Date.now() + 100000,
      tags: [],
      cacheLife: "default",
      fileId,
    });

    await cache.invalidateByFileId(fileId);

    await cache.setItem("v3-hash-user-alice", {
      encoded: '{"name":"Alice","version":3}',
      expires: Date.now() + 100000,
      tags: [],
      cacheLife: "default",
      fileId,
    });
    await cache.setItem("v3-hash-user-bob", {
      encoded: '{"name":"Bob","version":3}',
      expires: Date.now() + 100000,
      tags: [],
      cacheLife: "default",
      fileId,
    });

    const totalEntries = await countCacheEntries();
    expect(totalEntries).toBe(2);
  });

  test("cache entries should track their source file (fileId)", async () => {
    const storage = createStorage();
    const cache = createUnstorageCache(storage);

    const entry: CacheEntry = {
      encoded: "test-data",
      expires: Date.now() + 100000,
      tags: [],
      cacheLife: "default",
      fileId: "/src/data.tsx",
    };

    await cache.setItem("test-key", entry);
    const retrieved = await cache.getItem("test-key");

    expect(retrieved).not.toBeNull();
    expect(retrieved!.fileId).toBe("/src/data.tsx");
  });
});
