/**
 * Drop the public schema and rebuild it from the committed migrations, then
 * reseed the content tables.
 *
 *   npm run db:reset
 *
 * Destructive: all users, sessions and progress are deleted.
 */
import "dotenv/config";
import { execSync } from "node:child_process";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✗ DATABASE_URL is not set. Copy .env.example to .env first.");
  process.exit(1);
}

if (process.env.NODE_ENV === "production") {
  console.error("✗ Refusing to reset a production database.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

console.log("→ dropping schemas public and drizzle");
// `drizzle` holds the migration journal. Without dropping it, drizzle-kit
// believes the migrations are still applied and skips recreating the tables.
await client.query("drop schema if exists public cascade");
await client.query("drop schema if exists drizzle cascade");
await client.query("create schema public");

await client.end();

execSync("npm run db:migrate", { stdio: "inherit" });
execSync("npm run db:seed", { stdio: "inherit" });
console.log("✓ database reset");
