import type { MiddlewareFunction } from "react-router";
import { createStorage } from "unstorage";
import fsDriver from "unstorage/drivers/fs";
import { provideCache } from "vite-plugin-react-use-cache/runtime";
import { createUnstorageCache } from "vite-plugin-react-use-cache/unstorage";

export const cacheStorage = createStorage({
  driver: fsDriver({
    base: "./node_modules/.use-cache",
  }),
});

import.meta.hot?.on("vite:beforeUpdate", () => {
  cacheStorage.clear();
});

export const useCacheMiddleware: MiddlewareFunction = async (_, next) => {
  let waitUntilPromise: Promise<void>;
  return provideCache(
    createUnstorageCache(cacheStorage),
    () => {
      const nextPromise = next();

      const resultPromise = nextPromise.then((result) => {
        if (result instanceof Response) {
          return [result, result.clone()] as const;
        }
        return [result, undefined] as const;
      });

      waitUntilPromise = resultPromise.then(async ([, clone]) => {
        if (clone) {
          await clone.body?.pipeTo(new WritableStream());
        }
      });

      return resultPromise.then(([result]) => result);
    },
    () => waitUntilPromise
  );
};
