/**
 * Local Postgres without Docker.
 *
 *   npm run db:local          # start on :5432 with fluent/fluent
 *   npm run db:local:reset    # wipe .pgdata and start fresh
 *
 * This is a convenience for machines without Docker. It downloads a portable
 * Postgres build via `embedded-postgres` and keeps it in the foreground — stop
 * it with Ctrl+C. Production should point DATABASE_URL at Neon instead.
 */
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const dataDir = resolve(process.cwd(), ".pgdata");
const port = Number(process.env.PGPORT ?? 5432);
const user = process.env.PGUSER ?? "fluent";
const password = process.env.PGPASSWORD ?? "fluent";
const database = process.env.PGDATABASE ?? "fluent";

if (process.argv.includes("--reset") && existsSync(dataDir)) {
  console.log("→ removing .pgdata");
  rmSync(dataDir, { recursive: true, force: true });
}

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  port,
  user,
  password,
  persistent: true,
  autoRehydrateSymlinks: true,
  onLog: (message) => console.log(`  pg: ${message}`),
  onError: (error) => console.error("  pg error:", error)
});

if (!existsSync(resolve(dataDir, "PG_VERSION"))) {
  console.log("→ initialising cluster (first run only)");
  await pg.initialise();
}

await pg.start();
console.log(`\n  Postgres listening on postgresql://${user}:${password}@localhost:${port}/${database}\n`);

try {
  await pg.createDatabase(database);
  console.log(`→ created database "${database}"`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (!message.includes("already exists")) throw error;
}

async function shutdown() {
  console.log("\n→ stopping Postgres");
  await pg.stop().catch(() => {});
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Keep the process (and therefore the database) alive.
setInterval(() => {}, 1 << 30);
