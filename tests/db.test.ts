import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, getPool, withTx } from "@/lib/db";
import { runMigrations } from "../scripts/migrate.mjs";
import { assertTestDatabase, resetDb, wipeSchema } from "./helpers/db";

const MIGRATIONS = resolve(__dirname, "../migrations");

afterAll(async () => {
  await closePool();
});

describe("runMigrations", () => {
  beforeEach(async () => {
    await wipeSchema();
  });

  it("applies 001_init.sql and records it", async () => {
    const applied = await runMigrations(getPool(), MIGRATIONS);
    expect(applied).toContain("001_init.sql");
    const { rows } = await getPool().query(
      "SELECT to_regclass('public.users') AS users, to_regclass('public.events') AS events",
    );
    expect(rows[0]).toEqual({ users: "users", events: "events" });
  });

  it("a second run applies nothing", async () => {
    await runMigrations(getPool(), MIGRATIONS);
    expect(await runMigrations(getPool(), MIGRATIONS)).toEqual([]);
  });

  it("a failing migration rolls back and is not recorded", async () => {
    const dir = mkdtempSync(join(tmpdir(), "migrations-"));
    writeFileSync(
      join(dir, "001_bad.sql"),
      "CREATE TABLE half_done (id int); SELECT * FROM does_not_exist;",
    );
    await expect(runMigrations(getPool(), dir)).rejects.toThrow();
    const { rows } = await getPool().query(
      "SELECT to_regclass('public.half_done') AS t, (SELECT count(*) FROM schema_migrations)::int AS n",
    );
    expect(rows[0]).toEqual({ t: null, n: 0 });
  });
});

describe("withTx", () => {
  beforeEach(async () => {
    await wipeSchema();
    await getPool().query("CREATE TABLE t (n int)");
  });

  it("commits when the callback resolves", async () => {
    await withTx((c) => c.query("INSERT INTO t VALUES (1)"));
    const { rows } = await getPool().query("SELECT n FROM t");
    expect(rows).toEqual([{ n: 1 }]);
  });

  it("rolls back when the callback throws", async () => {
    await expect(
      withTx(async (c) => {
        await c.query("INSERT INTO t VALUES (1)");
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const { rows } = await getPool().query("SELECT n FROM t");
    expect(rows).toEqual([]);
  });

  it("returns the callback's value", async () => {
    expect(await withTx(async () => 42)).toBe(42);
  });
});

describe("test database guard", () => {
  it("resetDb truncates every table except schema_migrations", async () => {
    await wipeSchema();
    await runMigrations(getPool(), MIGRATIONS);
    await getPool().query(
      "INSERT INTO users (hca_id, email) VALUES ('ident!a', 'a@example.com')",
    );
    await resetDb();
    const { rows } = await getPool().query(
      "SELECT (SELECT count(*) FROM users)::int AS users, (SELECT count(*) FROM schema_migrations)::int AS migrations",
    );
    expect(rows[0]).toEqual({ users: 0, migrations: 1 });
  });

  it("refuses a database whose name does not end in _test", () => {
    expect(() =>
      assertTestDatabase("postgres://u:p@127.0.0.1:5432/rsvp"),
    ).toThrow(/_test/);
    expect(() =>
      assertTestDatabase("postgres://u:p@127.0.0.1:5432/rsvp_test"),
    ).not.toThrow();
  });

  it("refuses a missing url", () => {
    expect(() => assertTestDatabase(undefined)).toThrow();
  });
});
