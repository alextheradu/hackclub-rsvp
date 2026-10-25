import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const LOCK_ID = 727001;

/**
 * @param {import("pg").Pool} pool
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
export async function runMigrations(pool, dir) {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         name text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );
    const { rows } = await client.query("SELECT name FROM schema_migrations");
    const done = new Set(rows.map((row) => row.name));
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

    const applied = [];
    for (const name of files) {
      if (done.has(name)) continue;
      const sql = await readFile(join(dir, name), "utf8");
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
      applied.push(name);
    }
    return applied;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]).catch(() => {});
    client.release();
  }
}

const isCli =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString });
  const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../migrations");
  runMigrations(pool, dir)
    .then((applied) =>
      console.log(applied.length ? `applied: ${applied.join(", ")}` : "nothing to apply"),
    )
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
