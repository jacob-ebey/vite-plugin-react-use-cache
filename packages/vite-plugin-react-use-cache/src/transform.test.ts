import { test, expect, onTestFinished, vi } from "vitest";
import { useCachePlugin } from "./use-cache-plugin.ts";
import { createServer } from "vite";

test("basic", async () => {
  vi.setSystemTime("2024-06-20T12:30:16.507Z");

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
export async function NoArgs() {
  "use cache";
  return "test";
}

export async function Component(props) {
  "use cache";
  return "test" + props;
}

export async function ComponentDestructure({children}) {
  "use cache";
  return children;
}

const x = 1;
export async function closure() {
  const y = 2;
  function inner(props) {
    "use cache";
    return x + y + props;
  }
}

export function DestructuredComponentProps({ params: { test } }) {
  "use cache";
  return test + " destructured";
}`;
  const result = await (plugin.transform as any).apply(context, [code, id]);
  expect(result.code).toMatchInlineSnapshot(`
    "import { cache as _cache, getFileHash as _getFileHash } from "vite-plugin-react-use-cache/runtime";
    export async function NoArgs() {
      return _cache(async () => {
        return "test";
      }, [_getFileHash(), "transform.test.ts:2:7", "310238a2be60049155bb62e9ab04f65bf6f0a3e2cafbc206bcb6c37012020e08", "1718886616508"])();
    }
    export async function Component(props) {
      return _cache(async props => {
        return "test" + props;
      }, [_getFileHash(), "transform.test.ts:7:7", "4618a3725deea9a3a7ba0572529f472340a04f72a302ff67ed942065a8b358cb", "1718886616508"])(props);
    }
    export async function ComponentDestructure({
      children
    }) {
      return _cache(async ({
        children
      }) => {
        return children;
      }, [_getFileHash(), "transform.test.ts:12:7", "06067542b3e5caa1184e6797a33d7892fd567f99931a87c877a5c1c372992b93", "1718886616508"])({
        children
      });
    }
    const x = 1;
    export async function closure() {
      const y = 2;
      function inner(props) {
        return _cache(async (y, props) => {
          return x + y + props;
        }, [_getFileHash(), "transform.test.ts:20:2", "2f208d67999bb14ec8a648b7bac93064432a6763407ad98746f77c8949744b6d", "1718886616508"])(y, props);
      }
    }
    export function DestructuredComponentProps({
      params: {
        test
      }
    }) {
      return _cache(async ({
        params: {
          test
        }
      }) => {
        return test + " destructured";
      }, [_getFileHash(), "transform.test.ts:26:7", "02f89377552b6a9875f63bcf5b86e3db1d9dfcc1b7d4c2fc2e7178ba432fb322", "1718886616508"])({
        params: {
          test
        }
      });
    }
    "
  `);
});
