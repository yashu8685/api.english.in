/**
 * Edge / serverless database client.
 *
 * Not wired in by default. Use this when deploying the Hono app to a runtime
 * without TCP sockets (Cloudflare Workers, Vercel Edge). It talks to Neon over
 * HTTP, so it only works against a Neon database.
 *
 * To switch, change the export in `src/db/index.ts` to point here
 * (or add a conditional export).
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.js";
import { loadEnv } from "./env.js";

loadEnv();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

export const db = drizzle(neon(connectionString), { schema });
export type Database = typeof db;
