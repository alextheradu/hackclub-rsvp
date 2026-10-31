import type { QueryConfig, QueryResult } from "pg";
import { describe, expect, it } from "vitest";
import { q, sql, type Queryable } from "@/lib/db";

describe("sql", () => {
  it("returns plain text and no values when there are no interpolations", () => {
    expect(sql`SELECT 1`).toEqual({ text: "SELECT 1", values: [] });
  });

  it("numbers placeholders in order", () => {
    const a = 1;
    const b = "x";
    expect(sql`SELECT * FROM t WHERE a = ${a} AND b = ${b}`).toEqual({
      text: "SELECT * FROM t WHERE a = $1 AND b = $2",
      values: [1, "x"],
    });
  });

  it("gives a repeated value its own placeholder each time", () => {
    const v = "same";
    expect(sql`${v} ${v}`).toEqual({ text: "$1 $2", values: ["same", "same"] });
  });

  it("handles a value at the very start and very end", () => {
    expect(sql`${1}::int + ${2}`).toEqual({ text: "$1::int + $2", values: [1, 2] });
  });

  it("goes past $9 without mangling numbers", () => {
    const parts = Array.from({ length: 11 }, (_, i) => i);
    const strings = Object.assign(["", ...parts.slice(1).map(() => ","), ""], {
      raw: [] as string[],
    }) as unknown as TemplateStringsArray;
    const query = sql(strings, ...parts);
    expect(query.text).toBe("$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11");
    expect(query.values).toEqual(parts);
  });

  it("never puts values into the SQL text", () => {
    const evil = "'; DROP TABLE users; --";
    const query = sql`SELECT * FROM users WHERE name = ${evil}`;
    expect(query.text).not.toContain("DROP");
    expect(query.values).toEqual([evil]);
  });

  it("passes arrays and objects through as single values", () => {
    const ids = [1, 2, 3];
    const payload = { rsvpId: 4 };
    expect(sql`WHERE id = ANY(${ids}) AND p = ${payload}`).toEqual({
      text: "WHERE id = ANY($1) AND p = $2",
      values: [ids, payload],
    });
  });
});

function fakeConn(rows: Record<string, unknown>[], rowCount: number | null = rows.length) {
  const calls: QueryConfig[] = [];
  const conn: Queryable = {
    async query(config: QueryConfig) {
      calls.push(config);
      return { rows, rowCount } as QueryResult;
    },
  };
  return { conn, calls };
}

describe("q", () => {
  it("sends the text and values to the connection", async () => {
    const { conn, calls } = fakeConn([]);
    await q(conn).many(sql`SELECT ${1}`);
    expect(calls).toEqual([{ text: "SELECT $1", values: [1] }]);
  });

  it("many returns every row", async () => {
    const { conn } = fakeConn([{ id: 1 }, { id: 2 }]);
    expect(await q(conn).many(sql`SELECT`)).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("maybe returns the first row or undefined", async () => {
    expect(await q(fakeConn([{ id: 1 }, { id: 2 }]).conn).maybe(sql`SELECT`)).toEqual({ id: 1 });
    expect(await q(fakeConn([]).conn).maybe(sql`SELECT`)).toBeUndefined();
  });

  it("one returns the first row and throws when there is none", async () => {
    expect(await q(fakeConn([{ id: 1 }]).conn).one(sql`SELECT`)).toEqual({ id: 1 });
    await expect(q(fakeConn([]).conn).one(sql`SELECT`)).rejects.toThrow("expected a row");
  });

  it("exec returns rowCount, treating null as 0", async () => {
    expect(await q(fakeConn([], 3).conn).exec(sql`UPDATE`)).toBe(3);
    expect(await q(fakeConn([], null).conn).exec(sql`UPDATE`)).toBe(0);
  });
});
