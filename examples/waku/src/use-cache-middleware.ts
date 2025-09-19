import type { Middleware } from "waku/config";
import { provideCache } from "vite-plugin-react-use-cache/runtime";
import { createUnstorageCache } from "vite-plugin-react-use-cache/unstorage";
import { createStorage } from "unstorage";
import fsDriver from "unstorage/drivers/fs";

const storage = createStorage({
  driver: fsDriver({ base: "./node_modules/.use-cache" }),
});

const useCacheMiddleware: Middleware = () => async (_ctx, next) => {
  return provideCache(createUnstorageCache(storage), () => next());
};

export default useCacheMiddleware;
