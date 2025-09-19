import { Link } from "waku";
import { unstable_rerenderRoute } from "waku/router/server";
import { cacheLife } from "vite-plugin-react-use-cache/runtime";

import { Counter } from "../components/counter";
import { getSharedData, revalidateSharedData } from "../shared";

export default async function HomePage() {
  "use cache";
  cacheLife("seconds");

  console.log("Rendering Home Page");

  const shared = await getSharedData();

  return (
    <div>
      <title>{shared}</title>
      <h1 className="text-4xl font-bold tracking-tight">{shared}</h1>
      <Counter />
      <Link to="/about" className="mt-4 inline-block underline">
        About page
      </Link>

      <form
        action={async () => {
          "use server";
          revalidateSharedData();
          unstable_rerenderRoute("/");
        }}
      >
        <button className="mt-4 rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700">
          Revalidate Shared Data
        </button>
      </form>
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: "dynamic",
  } as const;
};
