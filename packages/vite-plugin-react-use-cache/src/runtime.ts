import "server-only";

import * as React from "react";
import { AsyncLocalStorage } from "node:async_hooks";

import {
  createFromReadableStream,
  encodeReply,
  renderToReadableStream,
} from "@vitejs/plugin-rsc/rsc";

export function getFileHash() {
  const stack = new Error().stack || "";
  const line = stack.split("\n")[2];
  const start = line.lastIndexOf("(") + 1;
  const end = line.lastIndexOf(")");
  const filename = line.slice(start, end).replace(/\\/g, "/");
  const basename = filename.split("/").pop();
  return basename;
}

export function cache<Func extends (...args: any[]) => any>(
  func: Func,
  deps: unknown[]
): MakeAsync<Func> {
  return React.cache<MakeAsync<Func>>(async (...args) => {
    const store = cacheStorage.getStore();
    if (!store) {
      throw new Error(
        "'use cache' can only be used within the context of provideCache."
      );
    }

    const key = await hashData(await getKey(deps, args));

    const cached = await store.cache.getItem(key);

    if (
      cached &&
      !cached.tags.some((tag) => store.revalidatedTags.has(tag)) &&
      (!cached.isElement || import.meta.env.PROD)
    ) {
      const { encoded, isElement } = cached;

      if (!isElement || !import.meta.env.DEV) {
        return await createFromReadableStream(
          new ReadableStream({
            async start(controller) {
              controller.enqueue(new TextEncoder().encode(encoded));
              controller.close();
            },
          })
        );
      }
    }

    const cacheContext: CacheStorage = {
      cache: store.cache,
      revalidatedTags: store.revalidatedTags,
      tags: store.tags ?? new Set(),
    };

    let toCache = cacheStorage.run(cacheContext, async () => func(...args));

    let errors: unknown[] = [];
    const storageStream = renderToReadableStream(toCache, {
      onError(error: unknown) {
        errors.push(error);
      },
    });

    let encoded = "";
    storageStream
      .pipeThrough(new TextDecoderStream())
      .pipeTo(
        new WritableStream({
          write(chunk) {
            encoded += chunk;
          },
        })
      )
      .then(async () => {
        if (errors.length) {
          throw new AggregateError(
            errors,
            "Errors occurred during cache encoding."
          );
        }
      })
      .then(async () => {
        const isElement = React.isValidElement(await toCache);
        if (store.tags && cacheContext.tags) {
          for (const tag of cacheContext.tags) {
            store.tags.add(tag);
            store.revalidatedTags.delete(tag);
          }
        }

        if (!isElement || import.meta.env.PROD) {
          return store.cache.setItem(key, {
            encoded,
            expires:
              Date.now() +
              (cacheLifeTimes.get(cacheContext.life ?? "default") ??
                cacheLifeTimes.get("default")!),
            isElement,
            tags: Array.from(cacheContext.tags ?? []),
          });
        }
      })
      .catch((reason) => {
        console.error("Failed to cache:", reason);
      });

    return toCache;
  });
}

export function cacheLife(life: CacheLife) {
  const store = cacheStorage.getStore();
  if (!store) {
    throw new Error("cacheLife must be called within a cache context.");
  }
  if (
    !store.life ||
    (cacheLifeMap.get(life) ?? Number.MAX_SAFE_INTEGER) <
      (cacheLifeMap.get(store.life) ?? Number.MAX_SAFE_INTEGER)
  ) {
    store.life = life;
  }
}

export function cacheTag(tag: string) {
  const store = cacheStorage.getStore();
  if (!store) {
    throw new Error("cacheTag must be called within a cache context.");
  }
  if (!store.tags) {
    throw new Error(
      "cacheTag must be used within a scope with the 'use cache' directive."
    );
  }
  store.tags.add(tag);
}

export async function revalidateTag(tag: string) {
  const store = cacheStorage.getStore();
  if (!store) {
    throw new Error("revalidateTag must be called within a cache context.");
  }
  store.revalidatedTags.add(tag);
  for (const revalidatedTag of await store.cache.revalidateTag(tag)) {
    store.revalidatedTags.add(revalidatedTag);
  }
}

export function provideCache<T>(cache: Cache, func: () => Promise<T>) {
  return cacheStorage.run({ cache, revalidatedTags: new Set() }, func);
}

async function getKey(deps: unknown[], args: unknown[]): Promise<string> {
  return await new Response(
    await encodeReply([
      deps.map(tryPrase).filter(Boolean),
      args.map(tryPrase).filter(Boolean),
    ])
  ).text();
}

function tryPrase(value: unknown): unknown {
  try {
    JSON.parse(JSON.stringify(value));
    return value;
  } catch {
    return null;
  }
}

type MakeAsync<Func extends (...args: any[]) => any> = (
  ...args: Parameters<Func>
) => Promise<Awaited<ReturnType<Func>>>;

type CacheLife =
  | "seconds"
  | "minutes"
  | "default"
  | "hours"
  | "days"
  | "weeks"
  | "max";

const cacheLifeValues: CacheLife[] = [
  "seconds",
  "minutes",
  "default",
  "hours",
  "days",
  "weeks",
  "max",
];
const cacheLifeMap: Map<CacheLife, number> = new Map(
  cacheLifeValues.map((life, index) => [life, index])
);

const cacheLifeTimes: Map<CacheLife, number> = new Map([
  ["seconds", 1000], // 1 second
  ["minutes", 60 * 1000], // 1 minute
  ["default", 5 * 60 * 1000], // 5 minutes
  ["hours", 60 * 60 * 1000], // 1 hour
  ["days", 24 * 60 * 60 * 1000], // 1 day
  ["weeks", 7 * 24 * 60 * 60 * 1000], // 7 days
  ["max", 6 * 30 * 24 * 60 * 60 * 1000], // 6 months
]);

export type CacheEntry = {
  encoded: string;
  expires: number;
  isElement: boolean;
  tags: string[];
};

export interface Cache {
  getItem(key: string): Promise<CacheEntry | null>;
  revalidateTag(tag: string): Promise<Set<string>>;
  setItem(key: string, value: CacheEntry): Promise<void>;
}

type CacheStorage = {
  cache: Cache;
  revalidatedTags: Set<string>;
  life?: CacheLife;
  tags?: Set<string>;
};

declare global {
  var ___VITE_USE_CACHE_STORAGE___: AsyncLocalStorage<CacheStorage> | undefined;
}

const cacheStorage = (global.___VITE_USE_CACHE_STORAGE___ ??=
  new AsyncLocalStorage<CacheStorage>());

async function hashData(dataString: string) {
  // Encode the string into a Uint8Array
  const textEncoder = new TextEncoder();
  const encodedData = textEncoder.encode(dataString);

  // Compute the SHA-256 hash
  const hashBuffer = await crypto.subtle.digest(
    {
      name: "SHA-256",
    },
    encodedData
  );

  // Convert the ArrayBuffer hash to a hexadecimal string for display
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hexHash = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return hexHash;
}
