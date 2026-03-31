import type { Middleware } from "remix/fetch-router";
import type { FileStorage } from "remix/file-storage";

import { type Cache, type CacheEntry, provideCache } from "./runtime.ts";

export function createRemixCache(storage: FileStorage): Cache {
  async function read<T>(key: string) {
    const file = await storage.get(key);
    if (!file) return null;
    const json = await file.text();
    const stored = JSON.parse(json) as T;
    return stored;
  }
  async function set(key: string, value: unknown) {
    await storage.set(key, new File([JSON.stringify(value)], key));
  }

  return {
    async getItem(key) {
      const stored = await read<CacheEntry>(key);
      if (!stored) return null;
      if ((stored.expires ?? 0) < Date.now()) {
        await storage.remove(`item-${key}`);
        return null;
      }
      return stored;
    },
    async setItem(key, value) {
      await set(key, value);

      if (value.fileId) {
        const fileKeys = (await read<string[]>(`file-${value.fileId}`)) ?? [];
        if (!fileKeys.includes(key)) {
          fileKeys.push(key);
          await set(`file-${value.fileId}`, fileKeys);
        }
      }

      for (const tag of value.tags) {
        const tags = (await read<string[]>(`tag-${tag}`)) || [];
        tags.push(key);
        await set(`tag-${tag}`, tags);
      }
    },
    async revalidateTag(
      tag,
      seen: { tags: Set<string>; keys: Set<string> } = {
        tags: new Set(),
        keys: new Set(),
      },
    ) {
      if (seen.tags.has(tag)) return seen.tags;
      seen.tags.add(tag);
      const keys = await read<string[]>(`tag-${tag}`);
      await storage.remove(`tag-${tag}`);
      for (const key of keys ?? []) {
        if (seen.keys.has(key)) continue;
        seen.keys.add(key);
        const stored = await read<CacheEntry>(`item-${key}`);
        if (!stored) continue;
        await storage.remove(`item-${key}`);
        await Promise.all(
          stored.tags.map((t) => (this.revalidateTag as any)(t, seen)),
        );
      }
      return seen.tags;
    },
    async invalidateByFileId(fileId) {
      const keys = await read<string[]>(`file-${fileId}`);
      if (!keys || keys.length === 0) return;

      await Promise.all(
        keys.map(async (key) => {
          const stored = await read<CacheEntry>(`item-${key}`);
          if (stored) {
            await storage.remove(`item-${key}`);
            for (const tag of stored.tags) {
              const tagKeys = await read<string[]>(`tag-${tag}`);
              if (tagKeys) {
                const filtered = tagKeys.filter((k) => k !== key);
                if (filtered.length > 0) {
                  await set(`tag-${tag}`, filtered);
                } else {
                  await storage.remove(`tag-${tag}`);
                }
              }
            }
          }
        }),
      );

      await storage.remove(`file-${fileId}`);
    },
  } satisfies Cache;
}

export function useCacheMiddleware(storage: FileStorage): Middleware {
  const cache = createRemixCache(storage);
  return (_, next) => {
    return provideCache(cache, next);
  };
}
