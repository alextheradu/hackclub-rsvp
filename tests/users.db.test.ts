import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, getPool } from "@/lib/db";
import type { HcaProfile } from "@/lib/hca";
import { upsertUser } from "@/lib/users";
import { runMigrations } from "../scripts/migrate.mjs";
import { resetDb, wipeSchema } from "./helpers/db";

const profile: HcaProfile = {
  sub: "ident!abc123",
  email: "ada@example.com",
  email_verified: true,
  name: "Ada Lovelace",
  given_name: "Ada",
  family_name: "Lovelace",
  nickname: "ada",
  slack_id: "U0ADA",
  verification_status: "verified",
  ysws_eligible: true,
};

beforeAll(async () => {
  await wipeSchema();
  await runMigrations(getPool(), resolve(__dirname, "../migrations"));
});

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closePool();
});

describe("upsertUser", () => {
  it("creates a user and reports isNew on first login", async () => {
    const result = await upsertUser(profile);
    expect(result.isNew).toBe(true);
    const { rows } = await getPool().query("SELECT * FROM users WHERE id = $1", [result.id]);
    expect(rows[0]).toMatchObject({
      hca_id: "ident!abc123",
      email: "ada@example.com",
      email_verified: true,
      name: "Ada Lovelace",
      given_name: "Ada",
      family_name: "Lovelace",
      nickname: "ada",
      slack_id: "U0ADA",
      verification_status: "verified",
      ysws_eligible: true,
    });
    expect(rows[0].last_login_at).not.toBeNull();
  });

  it("updates the same row on a second login and reports isNew false", async () => {
    const first = await upsertUser(profile);
    const second = await upsertUser({
      ...profile,
      email: "ada@new-address.example",
      name: "Ada L.",
      ysws_eligible: false,
    });
    expect(second).toEqual({ id: first.id, isNew: false });

    const { rows } = await getPool().query("SELECT * FROM users");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      email: "ada@new-address.example",
      name: "Ada L.",
      ysws_eligible: false,
    });
  });

  it("moves last_login_at and updated_at forward on a second login", async () => {
    const { id } = await upsertUser(profile);
    await getPool().query(
      "UPDATE users SET last_login_at = now() - interval '1 day', updated_at = now() - interval '1 day' WHERE id = $1",
      [id],
    );
    await upsertUser(profile);
    const { rows } = await getPool().query(
      "SELECT last_login_at > now() - interval '1 minute' AS login, updated_at > now() - interval '1 minute' AS upd FROM users WHERE id = $1",
      [id],
    );
    expect(rows[0]).toEqual({ login: true, upd: true });
  });

  it("stores missing optional claims as NULL", async () => {
    const { id } = await upsertUser({ sub: "ident!min", email: "min@example.com" });
    const { rows } = await getPool().query("SELECT slack_id, name, ysws_eligible FROM users WHERE id = $1", [id]);
    expect(rows[0]).toEqual({ slack_id: null, name: null, ysws_eligible: null });
  });

  it("keeps different hca_ids as different users even with the same email", async () => {
    const a = await upsertUser(profile);
    const b = await upsertUser({ ...profile, sub: "ident!other" });
    expect(b.id).not.toBe(a.id);
    expect(b.isNew).toBe(true);
  });

  it("20 parallel first logins for one user create exactly one row", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => upsertUser(profile)));
    expect(results.filter((r) => r.isNew)).toHaveLength(1);
    const { rows } = await getPool().query("SELECT count(*)::int AS n FROM users");
    expect(rows[0].n).toBe(1);
  });
});
