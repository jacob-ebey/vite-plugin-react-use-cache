import { test, expect, onTestFinished } from "vitest";
import { useCachePlugin } from "./use-cache-plugin.ts";
import { createServer } from "vite";

test("basic", async () => {
  const server = await createServer({
    configFile: false,
    root: import.meta.dirname,
    environments: { rsc: {} },
  });
  onTestFinished(() => server.close());
  const plugin = useCachePlugin();
  const context = { environment: server.environments.rsc };
  const id = import.meta.filename;
  const code = `
export async function Component(props) {
  "use cache";
  return "test" + props;
}

const x = 1;
export async function closure() {
  const y = 2;
  function inner(props) {
    "use cache";
    return x + y + props;
  }
}
`;
  const result = await (plugin.transform as any).apply(context, [code, id]);
  expect(result.code).toMatchInlineSnapshot(`
    "import { cache as _cache, getFileHash as _getFileHash } from "vite-plugin-react-use-cache/runtime";
    export async function Component(props) {
      return _cache(async props => {
        return "test" + props;
      }, [_getFileHash(), "transform.test.ts:2:7", "4618a3725deea9a3a7ba0572529f472340a04f72a302ff67ed942065a8b358cb"])(props);
    }
    const x = 1;
    export async function closure() {
      const y = 2;
      function inner(props) {
        return _cache(async (y, props) => {
          return x + y + props;
        }, [_getFileHash(), "transform.test.ts:10:2", "2f208d67999bb14ec8a648b7bac93064432a6763407ad98746f77c8949744b6d"])(y, props);
      }
    }"
  `);
});
