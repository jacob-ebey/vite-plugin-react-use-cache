import { test, expect, onTestFinished } from "vitest"
import { useCachePlugin } from "./use-cache-plugin.ts";
import { createServer } from "vite";

test("basic", async () => {
  const server = await createServer({
    configFile: false,
    root: import.meta.dirname,
    environments: { rsc: {} },
  })
  onTestFinished(() => server.close())
  const plugin = useCachePlugin()
  const context = { environment: server.environments.rsc }
  const id = import.meta.filename;
  const code = `
export async function Component(props) {
  "use cache";
  return "test";
}

export async function closure() {
  const x = 1;
  function inner(props) {
    "use cache";
    return x + props;
  }
}
`;
  const result = await (plugin.transform as any).apply(context, [code, id]);
  expect(result.code).toMatchInlineSnapshot(`
    "import { cache as _cache, getFileHash as _getFileHash } from "vite-plugin-react-use-cache/runtime";
    export async function Component(props) {
      return _cache(async () => {
        return "test";
      }, [_getFileHash(), "transform.test.ts:2:7", "dc941274278704274c1d7a82b000a511419a0b8dd114c4dcffe1f259f66df2df", props])();
    }
    export async function closure() {
      const x = 1;
      function inner(props) {
        return _cache(async () => {
          return x + props;
        }, [_getFileHash(), "transform.test.ts:9:2", "408078bff104670819e91dd749bbade2777b44cf8b416a8590ea8105e62d615f", x, props])();
      }
    }"
  `);
})
