import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { env } from "./env.js";

const server = serve(
  {
    fetch: app.fetch,
    port: env.PORT
  },
  (info) => {
    console.log(`\n  Fluent API ready on http://localhost:${info.port}  (${env.NODE_ENV})\n`);
    console.log(`  → health   http://localhost:${info.port}/health`);
    console.log(`  → auth     http://localhost:${info.port}/api/auth/get-session`);
    console.log(`  → web      ${env.WEB_ORIGIN}\n`);
  }
);

function shutdown(signal: string): void {
  console.log(`\n${signal} received — closing server`);
  server.close(() => process.exit(0));
  // Don't hang forever if a connection refuses to close.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
