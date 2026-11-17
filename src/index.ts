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

// A second `npm run dev` hits EADDRINUSE. Print the fix instead of a raw
// unhandled 'error' stack trace.
server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`\n  Port ${env.PORT} is already in use.`);
    console.error(`  Another API process is probably running. Stop it with:`);
    console.error(`\n      fuser -k ${env.PORT}/tcp\n`);
    console.error(`  Then start this server again, or set a different PORT in api/.env.\n`);
  } else {
    console.error(`\n  The API server could not start: ${error.message}\n`);
  }
  process.exit(1);
});

function shutdown(signal: string): void {
  console.log(`\n${signal} received — closing server`);
  server.close(() => process.exit(0));
  // Don't hang forever if a connection refuses to close.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
