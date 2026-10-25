import { Pool, type PoolClient } from "pg";

const globalForPool = globalThis as unknown as { __pgPool?: Pool };

export function getPool(): Pool {
  if (!globalForPool.__pgPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    globalForPool.__pgPool = new Pool({ connectionString });
  }
  return globalForPool.__pgPool;
}

export async function closePool(): Promise<void> {
  const pool = globalForPool.__pgPool;
  globalForPool.__pgPool = undefined;
  await pool?.end();
}

export async function withTx<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
