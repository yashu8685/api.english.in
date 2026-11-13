/**
 * Shared test-database setup used by the API's Vitest suite and the web app's
 * Playwright suite.
 *
 * Tests never touch the development database. They get a dedicated
 * `fluent_test` database with a fresh schema, the committed migrations applied
 * and the starter deck seeded.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import pg from "pg";

// This file lives in api/scripts, so the API project is one level up.
const apiDir = fileURLToPath(new URL("..", import.meta.url));
const envFile = resolve(apiDir, ".env");
if (existsSync(envFile)) loadDotenv({ path: envFile, quiet: true });

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://fluent:fluent@localhost:5432/fluent_test";

function databaseName(url: URL): string {
  const name = url.pathname.replace(/^\//, "");
  // Keep the identifier safe: we interpolate it into CREATE/DROP statements.
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(`Refusing to use unsafe test database name: ${JSON.stringify(name)}`);
  }
  return name;
}

async function ensureDatabase(url: URL): Promise<void> {
  const name = databaseName(url);
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";

  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  try {
    await admin.connect();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Cannot reach Postgres for tests (${message}).\n` +
        "Start it with `npm run db:local` in the api folder, or point TEST_DATABASE_URL at a running database."
    );
  }

  const exists = await admin.query("select 1 from pg_database where datname = $1", [name]);
  if (exists.rowCount === 0) {
    await admin.query(`create database "${name}"`);
  }
  await admin.end();
}

function run(command: string, args: string[], cwd: string, databaseUrl: string): void {
  execFileSync(command, args, {
    cwd,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      TEST_DATABASE_URL: databaseUrl,
      NODE_ENV: "test"
    },
    stdio: "inherit"
  });
}

/**
 * Drops and rebuilds the test schema, then applies migrations and seeds.
 * Safe to call from a test runner's global setup.
 */
export async function prepareTestDatabase(): Promise<void> {
  const url = new URL(TEST_DATABASE_URL);
  await ensureDatabase(url);

  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  // `drizzle` holds the migration journal. Dropping only `public` would make
  // drizzle-kit think the migrations were already applied.
  await client.query("drop schema if exists public cascade");
  await client.query("drop schema if exists drizzle cascade");
  await client.query("create schema public");
  await client.end();

  console.log("→ applying migrations to the test database");
  run("npm", ["run", "db:migrate"], apiDir, url.toString());
  console.log("→ seeding the test database");
  run("npm", ["run", "db:seed"], apiDir, url.toString());
  console.log(`✓ test database ready (${databaseName(url)})`);
}
