import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    remix: "./src/remix.ts",
    runtime: "./src/runtime.ts",
    unstorage: "./src/unstorage.ts",
    "use-cache-plugin": "./src/use-cache-plugin.ts",
  },
  external: ["vite-plugin-react-use-cache/runtime"],
  dts: {
    tsgo: true,
  },
});
