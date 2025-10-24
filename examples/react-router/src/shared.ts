import "server-only";

import { cacheTag, revalidateTag } from "vite-plugin-react-use-cache/runtime";

let i = 0;

export async function getSharedData() {
  "use cache";
  cacheTag("shared-data");

  console.log(`Fetching Shared Data ${i}`);
  return `Hello, Shared ${i}!`;
}

export async function revalidateSharedData() {
  "use server";
  i++;
  await revalidateTag("shared-data");
}
