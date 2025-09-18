import "server-only";

export async function getSharedData() {
  "use cache";
  console.log("Fetching Shared Data");

  return "Hello, Shared!";
}
