import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

/**
 * Load the API `.env` (and an optional `.env.local` override) no matter
 * which workspace directory the process was started from.
 *
 * We deliberately use `process.cwd()` rather than `import.meta.dirname`:
 * drizzle-kit loads this config through a bundler that rewrites `import.meta`,
 * and the npm scripts always run with a cwd inside the repo.
 */
export function loadEnv(): void {
  const cwd = process.cwd();
  const candidates = [
    cwd,
    resolve(cwd, ".."),
    resolve(cwd, "../.."),
    resolve(cwd, "../../..")
  ];

  const dir = candidates.find(
    (candidate) =>
      existsSync(resolve(candidate, ".env")) || existsSync(resolve(candidate, ".env.local"))
  );
  if (!dir) return;

  config({ path: resolve(dir, ".env"), quiet: true });
  config({ path: resolve(dir, ".env.local"), override: true, quiet: true });
}

loadEnv();
