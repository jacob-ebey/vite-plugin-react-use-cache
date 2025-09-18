import type { Storage } from "unstorage";

import type { Cache, CacheEntry } from "./runtime.ts";

export function createUnstorageCache(storage: Storage): Cache {
  return {
    async getItem(key) {
      const stored = await storage.get<CacheEntry>(key);
      if (!stored) return null;

      if ((stored.expires ?? 0) < Date.now()) {
        await storage.remove(key);
        return null;
      }

      return stored;
    },
    async setItem(key, value) {
      return await storage.set(key, value);
    },
  };
}
