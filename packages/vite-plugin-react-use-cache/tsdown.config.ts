import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "./src/runtime.ts",
    "./src/unstorage.ts",
    "./src/use-cache-plugin.ts",
  ],
  dts: {
    tsgo: true,
  },
});
