import type { MiddlewareFunction } from "react-router";
import { createStorage } from "unstorage";
import fsDriver from "unstorage/drivers/fs";
import { provideCache } from "vite-plugin-react-use-cache/runtime";
import { createUnstorageCache } from "vite-plugin-react-use-cache/unstorage";

const cacheStorage = createStorage({
  driver: fsDriver({
    base: "./node_modules/.use-cache",
  }),
});

export const useCacheMiddleware: MiddlewareFunction = async (_, next) => {
  return provideCache(createUnstorageCache(cacheStorage), () => next());
};
