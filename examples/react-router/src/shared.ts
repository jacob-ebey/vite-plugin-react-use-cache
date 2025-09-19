import "server-only";

import { cacheTag, revalidateTag } from "vite-plugin-react-use-cache/runtime";

let i = 0;

export async function getSharedData() {
  "use cache";
  console.log("Fetching Shared Data");
  cacheTag("shared-data");

  return `Hello, Shared ${i++}!`;
}

export async function revalidateSharedData() {
  "use server";
  await revalidateTag("shared-data");
}
