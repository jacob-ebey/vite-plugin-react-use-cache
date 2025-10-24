import { cacheLife } from "vite-plugin-react-use-cache/runtime";

import { getSharedData, revalidateSharedData } from "../../shared.ts";
import { Counter } from "./client.tsx";

export default async function Home() {
  console.log("Rendering Home Route");

  const shared = await getSharedData();

  return (
    <>
      <title>{shared}</title>
      <main className="mx-auto max-w-screen-xl px-4 py-8 lg:py-12">
        <article className="prose mx-auto">
          <h1>{shared}</h1>
          <Donut>
            <CachedSubComponent />
            <p>Dynamic Children {new Date().toISOString()}</p>
          </Donut>
          <p>
            This is a simple example of a React Router application using React
            Server Components (RSC) with Vite. It demonstrates how to set up a
            basic routing structure and render components server-side.
          </p>
        </article>
        <Counter />
        <form action={revalidateSharedData}>
          <button className="mt-4 rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700">
            Revalidate Shared Data
          </button>
        </form>
      </main>
    </>
  );
}

async function CachedSubComponent() {
  "use cache";

  console.log("Rendering CachedSubComponent");
  const shared = await getSharedData();

  return (
    <p>
      Cached Children {new Date().toISOString()} - {shared}
    </p>
  );
}

async function Donut({ children }: { children?: React.ReactNode }) {
  "use cache";
  cacheLife("minutes");

  console.log("Rendering Donut");

  return (
    <div className="border-red-500 border p-2">
      <p>
        <code>"use cache"; cacheLife("minutes")</code>{" "}
        {new Date().toISOString()}
      </p>
      {children}
    </div>
  );
}
