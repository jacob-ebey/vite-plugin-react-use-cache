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

      if (value.fileId) {
        const fileKeys =
          (await storage.get<string[]>(`file-${value.fileId}`)) || [];
        if (!fileKeys.includes(key)) {
          fileKeys.push(key);
          await storage.set(`file-${value.fileId}`, fileKeys);
        }
      }

      for (const tag of value.tags) {
        const tags = (await storage.get<string[]>(`tag-${tag}`)) || [];
        tags.push(key);
        await storage.set(`tag-${tag}`, tags);
      }
    },
    async invalidateByFileId(fileId) {
      const keys = await storage.get<string[]>(`file-${fileId}`);
      if (!keys || keys.length === 0) return;

      await Promise.all(
        keys.map(async (key) => {
          const stored = await storage.get<CacheEntry>(`item-${key}`);
          if (stored) {
            await storage.remove(`item-${key}`);
            for (const tag of stored.tags) {
              const tagKeys = await storage.get<string[]>(`tag-${tag}`);
              if (tagKeys) {
                const filtered = tagKeys.filter((k) => k !== key);
                if (filtered.length > 0) {
                  await storage.set(`tag-${tag}`, filtered);
                } else {
                  await storage.remove(`tag-${tag}`);
                }
              }
            }
          }
        })
      );

      await storage.remove(`file-${fileId}`);
    },
  };
}
