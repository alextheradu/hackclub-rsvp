import { getPool } from "@/lib/db";

export function assertTestDatabase(url: string | undefined): void {
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!name.endsWith("_test")) {
    throw new Error(`refusing to touch database "${name}": its name must end in _test`);
  }
}

function assertSafe(): void {
  assertTestDatabase(process.env.TEST_DATABASE_URL);
  assertTestDatabase(process.env.DATABASE_URL);
  if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) {
    throw new Error("DATABASE_URL must equal TEST_DATABASE_URL in tests");
  }
}

export async function wipeSchema(): Promise<void> {
  assertSafe();
  await getPool().query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
}

export async function resetDb(): Promise<void> {
  assertSafe();
  const { rows } = await getPool().query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'",
  );
  if (rows.length === 0) return;
  const names = rows.map((r) => `"${r.tablename.replace(/"/g, '""')}"`).join(", ");
  await getPool().query(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);
}