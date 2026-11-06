import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, getPool } from "@/lib/db";
import { hit } from "@/lib/ratelimit";
import { runMigrations } from "../scripts/migrate.mjs";
import { resetDb, wipeSchema } from "./helpers/db";

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

const at = (iso: string) => new Date(iso);

describe("hit", () => {
  it("allows up to the limit, then blocks", async () => {
    const now = at("2026-11-05T12:00:10Z");
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await hit("rsvp:user:1", 3, 60, now));
    expect(results).toEqual([
      { allowed: true, remaining: 2 },
      { allowed: true, remaining: 1 },
      { allowed: true, remaining: 0 },
      { allowed: false, remaining: 0 },
    ]);
  });

  it("starts counting again in a new window", async () => {
    await hit("rsvp:user:1", 1, 60, at("2026-11-05T12:00:10Z"));
    expect(await hit("rsvp:user:1", 1, 60, at("2026-11-05T12:00:59Z"))).toEqual({
      allowed: false,
      remaining: 0,
    });
    expect(await hit("rsvp:user:1", 1, 60, at("2026-11-05T12:01:00Z"))).toEqual({
      allowed: true,
      remaining: 0,
    });
  });

  it("keeps different keys independent", async () => {
    const now = at("2026-11-05T12:00:10Z");
    await hit("rsvp:user:1", 1, 60, now);
    expect((await hit("rsvp:user:1", 1, 60, now)).allowed).toBe(false);
    expect((await hit("rsvp:user:2", 1, 60, now)).allowed).toBe(true);
    expect((await hit("login:ip:203.0.113.7", 1, 60, now)).allowed).toBe(true);
  });

  it("counts requests that arrive at the same time correctly", async () => {
    const now = at("2026-11-05T12:00:10Z");
    const results = await Promise.all(
      Array.from({ length: 10 }, () => hit("login:ip:203.0.113.7", 5, 60, now)),
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(5);
  });
});
