import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";
import { loadEnv } from "./env.js";

loadEnv();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env and fill it in, then run `npm run db:push`."
  );
}

/**
 * The API runs on Node, so it uses node-postgres over TCP. This works with a
 * local Docker Postgres and with Neon's standard (non-HTTP) connection string.
 *
 * For edge/serverless targets see `client.edge.ts`.
 */
const globalForDb = globalThis as unknown as { __fluentPool?: Pool };

export const pool =
  globalForDb.__fluentPool ??
  new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });

// Reuse the pool across hot reloads in dev instead of leaking connections.
if (process.env.NODE_ENV !== "production") {
  globalForDb.__fluentPool = pool;
}

export const db = drizzle(pool, { schema });

export type Database = typeof db;
export { schema };
