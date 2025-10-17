import { cacheTag, revalidateTag } from "vite-plugin-react-use-cache/runtime";
import { CacheComponentInner } from "./other";

export function Donut() {
  return (
    <div>
      <CacheComponent>
        <div className="border-green-500 border p-2 m-2">
          Dynamic children (rendered at {new Date().toISOString()})
        </div>
      </CacheComponent>
      <form
        action={async () => {
          "use server";
          await revalidateTag("donut");
        }}
      >
        <button className="mt-4 rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700 cursor-pointer">
          Revalidate "use cache" component
        </button>
      </form>
    </div>
  );
}

async function CacheComponent(props: { children?: React.ReactNode }) {
  "use cache";
  cacheTag("donut");
  return (
    <div className="border-red-500 border p-2">
      "use cache" component (rendered at {new Date().toISOString()})
      {props.children}
      <CacheComponentInner />
    </div>
  );
}
