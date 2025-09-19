# vite-plugin-react-use-cache

A Vite plugin and runtime to enable the `"use cache"` directive in RSC projects. This package provides:

- `useCachePlugin()` — a Vite plugin to wire up build-time needs.
- `provideCache()` — provides a cache implementation.
- A `"use cache"` directive and `cacheLife()`, `cacheTag()` and `revalidateTag()` helpers for marking scopes as cacheable and revalidation.

## Install

Install the plugin in your project (example uses pnpm):

```bash
pnpm add -D vite-plugin-react-use-cache
```

If you use the Unstorage adapter, also install `unstorage` and a driver (for example the `fs` driver):

```bash
pnpm add unstorage
```

## Quickstart

1. Add the plugin to your `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import rsc from '@vitejs/plugin-rsc/plugin';
import { useCachePlugin } from 'vite-plugin-react-use-cache';

export default defineConfig({
	plugins: [
		react(),
		rsc({ ... }),
		useCachePlugin(),
	],
});
```

2. Provide a cache implementation:

```ts
import { createStorage } from "unstorage";
import fsDriver from "unstorage/drivers/fs";
import { provideCache } from "vite-plugin-react-use-cache/runtime";
import { createUnstorageCache } from "vite-plugin-react-use-cache/unstorage";

const storage = createStorage({ driver: fsDriver({ base: "./.cache" }) });

// Wrap your server rendering / request handler with provideCache
function fetchServer(request: Request) {
  return provideCache(createUnstorageCache(storage), () => {
    // match and render your RSC routes
  });
}
```

3. Cache data or components by adding the `"use cache"` directive and optionally calling `cacheLife(...)`:

```tsx
import {
  cacheTag,
  cacheLife,
  revalidateTag,
} from "vite-plugin-react-use-cache/runtime";

export default async function Home() {
  // Enable caching for this route/component
  "use cache";

  // Set the cache lifetime — the package accepts a string token such as 'seconds', 'minutes', ...
  cacheLife("seconds");
  cacheTag("home-page");

  const data = await fetchSomeSharedData();
  return (
    <div>
      {data}
      <form
        action={async () => {
          "use server";
          await revalidateTag("home-page");
        }}
      >
        <button type="submit">Revalidate Home</button>
      </form>
    </div>
  );
}
```

Notes:

- In development (dev) mode React components are not cached to preserve fast feedback and HMR behavior. Data functions are always cached.

## API

- `useCachePlugin(): Plugin` — Vite plugin, call in your Vite config. No options required for the basic use case.
- `provideCache(cacheImpl, fn)` — Run `fn` with the provided cache implementation available to the RSC runtime and route modules.
- `cacheLife(value)` — Set the cache lifetime for the current scope.
- `cacheTag(tag)` — Associate the current cached scope (data function or component with `"use cache"`) with an arbitrary tag string for later invalidation.
- `revalidateTag(tag)` — Invalidate all cached entries associated with `tag` (and any tags they reference) causing subsequent calls to recompute.

## Contributing

Contributions, bug reports and PRs are welcome. Please open issues against this repository and make PRs against `main`.

## License

MIT
