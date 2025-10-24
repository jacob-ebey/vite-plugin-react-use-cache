import "server-only";

import * as React from "react";
import { AsyncLocalStorage } from "node:async_hooks";

import {
  createFromReadableStream,
  encodeReply,
  renderToReadableStream,
  createClientTemporaryReferenceSet,
  createTemporaryReferenceSet,
  decodeReply,
} from "@vitejs/plugin-rsc/rsc";

export function getFileHash(): string {
  const stack = new Error().stack || "";
  const line = stack.split("\n")[2];
  const start = line.lastIndexOf("(") + 1;
  const end = line.lastIndexOf(")");
  const filename = line.slice(start, end).replace(/\\/g, "/");
  const basename = filename.split("/").pop();
  return basename!;
}

export function cache<Func extends (...args: any[]) => any>(
  func: Func,
  deps: string[]
): MakeAsync<Func> {
  return React.cache(async (...args) => {
    const store = cacheStorage.getStore();
    if (!store) {
      throw new Error(
        "'use cache' can only be used within the context of provideCache."
      );
    }

    const clientTemporaryReferences = createClientTemporaryReferenceSet();

    function returnFromStream(stream: ReadableStream) {
      return createFromReadableStream<any>(stream, {
        environmentName: "Cache",
        replayConsoleLogs: false,
        temporaryReferences: clientTemporaryReferences,
      });
    }

    const encodedKeys = await encodeReply([...deps, ...args], {
      temporaryReferences: clientTemporaryReferences,
    });
    const key = await hashData(encodedKeys);
    const cached = await store.cache.getItem(key);

    if (cached && !cached.tags.some((tag) => store.revalidatedTags.has(tag))) {
      const { encoded } = cached;
      return returnFromStream(stringToStream(encoded));
    }

    const cacheContext: CacheStorage = {
      cache: store.cache,
      revalidatedTags: store.revalidatedTags,
      tags: store.tags ?? new Set(),
      waitUntilToCache: store.waitUntilToCache,
      waitUntil: store.waitUntil,
    };

    const temporaryReferences = createTemporaryReferenceSet();
    const decodedKeys = await decodeReply(encodedKeys, {
      temporaryReferences,
    });
    const decodedArgs = decodedKeys.slice(deps.length);
    let toCache = cacheStorage.run(cacheContext, async () =>
      func(...decodedArgs)
    );

    let errors: unknown[] = [];
    const toCacheStream = renderToReadableStream(toCache, {
      environmentName: "Cache",
      temporaryReferences,
      onError(error: unknown) {
        errors.push(error);
      },
    });
    const [resultStream, storageStream] = toCacheStream.tee();

    let encoded = "";
    store.waitUntil(
      Promise.resolve(store.waitUntilToCache?.()).then(() =>
        storageStream
          .pipeThrough(new TextDecoderStream() as any)
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
          .then(() => {
            if (store.tags && cacheContext.tags) {
              for (const tag of cacheContext.tags) {
                store.tags.add(tag);
              }
            }

            const cacheTime =
              cacheLifeTimes.get(cacheContext.life ?? "default") ??
              cacheLifeTimes.get("default")!;

            return store.cache.setItem(key, {
              encoded,
              expires: Date.now() + cacheTime,
              tags: Array.from(cacheContext.tags ?? []),
              cacheLife: cacheContext.life ?? "default",
            });
          })
          .catch((reason) => {
            console.error("Failed to cache:", reason);
          })
      )
    );

    return returnFromStream(resultStream);
  });
}

export function cacheLife(life: CacheLife): void {
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

export function cacheTag(tag: string): void {
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

export async function revalidateTag(tag: string): Promise<void> {
  const store = cacheStorage.getStore();
  if (!store) {
    throw new Error("revalidateTag must be called within a cache context.");
  }
  store.revalidatedTags.add(tag);
  for (const revalidatedTag of await store.cache.revalidateTag(tag)) {
    store.revalidatedTags.add(revalidatedTag);
  }
}

export async function provideCache<T>(
  cache: Cache,
  func: () => Promise<T>,
  waitUntilToCache: undefined | (() => Promise<void>) = undefined,
  waitUntil: (promise: Promise<void>) => void = () => {}
): Promise<T> {
  const result = await cacheStorage.run(
    {
      cache,
      revalidatedTags: new Set(),
      waitUntilToCache,
      waitUntil,
    },
    func
  );
  return result;
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
  tags: string[];
  cacheLife: string;
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
  waitUntilToCache?: () => Promise<void>;
  waitUntil: (promise: Promise<void>) => void;
};

declare global {
  var ___VITE_USE_CACHE_STORAGE___: AsyncLocalStorage<CacheStorage> | undefined;
}

const cacheStorage = (global.___VITE_USE_CACHE_STORAGE___ ??=
  new AsyncLocalStorage<CacheStorage>());

async function hashData(encodedArgs: string | FormData) {
  const encodedData = await new Response(encodedArgs).arrayBuffer();

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

function stringToStream(s: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(s));
      controller.close();
    },
  });
}
