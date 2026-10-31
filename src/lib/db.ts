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

/** Anything that can run a query: the pool, or a client inside withTx. */
export type Queryable = { query(config: QueryConfig): Promise<QueryResult> };

export type Sql = { text: string; values: unknown[] };

/**
 * Tagged template for parameterized SQL.
 *
 *   sql`SELECT * FROM events WHERE id = ${id}`
 *   // => { text: "SELECT * FROM events WHERE id = $1", values: [id] }
 *
 * Every ${...} becomes a bound parameter, never raw SQL text, so it cannot be
 * used for identifiers or SQL fragments. Use `= ANY(${array})` instead of IN.
 */
export function sql(strings: TemplateStringsArray, ...values: unknown[]): Sql {
  let text = strings[0];
  for (let i = 0; i < values.length; i++) {
    text += `$${i + 1}${strings[i + 1]}`;
  }
  return { text, values };
}

/**
 * Query helpers bound to a connection (defaults to the pool).
 *
 *   const db = q(client);
 *   const event = await db.maybe<{ id: string }>(sql`...`);
 */
export function q(conn: Queryable = getPool()) {
  return {
    /** All rows. */
    many: async <T>(query: Sql): Promise<T[]> => (await conn.query(query)).rows as T[],
    /** First row, or undefined if there are none. */
    maybe: async <T>(query: Sql): Promise<T | undefined> =>
      (await conn.query(query)).rows[0] as T | undefined,
    /** First row; throws if there are none. */
    one: async <T>(query: Sql): Promise<T> => {
      const row = (await conn.query(query)).rows[0];
      if (row === undefined) throw new Error("expected a row, got none");
      return row as T;
    },
    /** Number of rows affected (or returned, for SELECT). */
    exec: async (query: Sql): Promise<number> => (await conn.query(query)).rowCount ?? 0,
  };
}
