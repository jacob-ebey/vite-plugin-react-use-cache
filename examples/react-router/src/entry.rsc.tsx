import {
  createTemporaryReferenceSet,
  decodeAction,
  decodeFormState,
  decodeReply,
  loadServerAction,
  renderToReadableStream,
} from "@vitejs/plugin-rsc/rsc";
import { unstable_matchRSCServerRequest as matchRSCServerRequest } from "react-router";
import { createStorage } from "unstorage";
import fsDriver from "unstorage/drivers/fs";
import { provideCache } from "vite-plugin-react-use-cache/runtime";
import { createUnstorageCache } from "vite-plugin-react-use-cache/unstorage";

import { routes } from "./routes/config";

const cacheStorage = createStorage({
  driver: fsDriver({
    base: "./.cache",
  }),
});

function fetchServer(request: Request) {
  return provideCache(createUnstorageCache(cacheStorage), () =>
    matchRSCServerRequest({
      // Provide the React Server touchpoints.
      createTemporaryReferenceSet,
      decodeAction,
      decodeFormState,
      decodeReply,
      loadServerAction,
      // The incoming request.
      request,
      // The app routes.
      routes: routes(),
      // Encode the match with the React Server implementation.
      generateResponse(match, options) {
        return new Response(renderToReadableStream(match.payload, options), {
          status: match.statusCode,
          headers: match.headers,
        });
      },
    })
  );
}

export default async function handler(request: Request) {
  // Import the generateHTML function from the client environment
  const ssr = await import.meta.viteRsc.loadModule<
    typeof import("./entry.ssr")
  >("ssr", "index");

  return ssr.generateHTML(request, fetchServer);
}

if (import.meta.hot) {
  import.meta.hot.accept();
}
