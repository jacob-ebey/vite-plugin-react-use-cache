import { cacheTag, revalidateTag } from "vite-plugin-react-use-cache/runtime";
import { unstable_rerenderRoute } from "waku/router/server";

export function Donut() {
  return (
    <div>
      <CacheComponent>
        <span>{new Date().toISOString()}</span>
      </CacheComponent>
      <form
        action={async () => {
          "use server";
          await revalidateTag("donut");
          unstable_rerenderRoute("/");
        }}
      >
        <button className="mt-4 rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700">
          Revalidate cache component
        </button>
      </form>
    </div>
  )
}

async function CacheComponent(props: { children?: React.ReactNode }) {
  'use cache'
  cacheTag("donut");
  return (
    <div data-testid="test-use-cache-component">
      [test-use-cache-component]{' '}
      <span data-testid="test-use-cache-component-static">
        (static: {new Date().toISOString()})
      </span>{' '}
      <span data-testid="test-use-cache-component-dynamic">
        (dynamic: {props.children})
      </span>
    </div>
  )
}
