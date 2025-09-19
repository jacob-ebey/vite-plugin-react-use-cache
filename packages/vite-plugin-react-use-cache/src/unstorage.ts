import type { Storage } from "unstorage";

import type { Cache, CacheEntry } from "./runtime.ts";

export function createUnstorageCache(storage: Storage): Cache {
  return {
    async getItem(key) {
      const stored = await storage.get<CacheEntry>(`item-${key}`);
      if (!stored) return null;

      if ((stored.expires ?? 0) < Date.now()) {
        await storage.remove(`item-${key}`);
        return null;
      }

      return stored;
    },
    async revalidateTag(
      tag,
      seen: { tags: Set<string>; keys: Set<string> } = {
        tags: new Set(),
        keys: new Set(),
      }
    ) {
      if (seen.tags.has(tag)) return seen.tags;
      seen.tags.add(tag);
      const keys = await storage.get<string[]>(`tag-${tag}`);
      await storage.remove(`tag-${tag}`);
      for (const key of keys ?? []) {
        if (seen.keys.has(key)) continue;
        seen.keys.add(key);
        const stored = await storage.get<CacheEntry>(`item-${key}`);
        if (!stored) continue;
        await storage.remove(`item-${key}`);
        await Promise.all(
          stored.tags.map((t) => (this.revalidateTag as any)(t, seen))
        );
      }
      return seen.tags;
    },
    async setItem(key, value) {
      await storage.set(`item-${key}`, value);
      for (const tag of value.tags) {
        const tags = (await storage.get<string[]>(`tag-${tag}`)) || [];
        tags.push(key);
        await storage.set(`tag-${tag}`, tags);
      }
    },
  };
}
