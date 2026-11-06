import { Pool, type PoolClient, type QueryConfig, type QueryResult } from "pg";

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

export type Queryable = { query(config: QueryConfig): Promise<QueryResult> };

export type Sql = { text: string; values: unknown[] };

// Every ${...} is a bound parameter, so it can't be an identifier or SQL fragment.
// Use `= ANY(${array})` instead of IN.
export function sql(strings: TemplateStringsArray, ...values: unknown[]): Sql {
  let text = strings[0];
  for (let i = 0; i < values.length; i++) {
    text += `$${i + 1}${strings[i + 1]}`;
  }
  return { text, values };
}

export function q(conn: Queryable = getPool()) {
  return {
    many: async <T>(query: Sql): Promise<T[]> =>
      (await conn.query(query)).rows as T[],
    maybe: async <T>(query: Sql): Promise<T | undefined> =>
      (await conn.query(query)).rows[0] as T | undefined,
    one: async <T>(query: Sql): Promise<T> => {
      const row = (await conn.query(query)).rows[0];
      if (row === undefined) throw new Error("expected a row, got none");
      return row as T;
    },
    exec: async (query: Sql): Promise<number> =>
      (await conn.query(query)).rowCount ?? 0,
  };
}
