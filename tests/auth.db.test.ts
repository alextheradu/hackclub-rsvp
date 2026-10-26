import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { userFromSessionToken } from "@/lib/auth";
import { closePool, getPool } from "@/lib/db";
import { signSession } from "@/lib/session";
import { upsertUser } from "@/lib/users";
import { runMigrations } from "../scripts/migrate.mjs";
import { resetDb, wipeSchema } from "./helpers/db";

const SECRET = "test-secret-at-least-32-characters-long";
const DAY = 24 * 60 * 60 * 1000;

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

async function createUser() {
  const { id } = await upsertUser({
    sub: "ident!abc123",
    email: "ada@example.com",
    name: "Ada Lovelace",
    slack_id: "U0ADA",
    ysws_eligible: true,
  });
  return id;
}

describe("userFromSessionToken", () => {
  it("returns the user for a valid token", async () => {
    const id = await createUser();
    const token = signSession({ uid: id }, SECRET);
    await expect(userFromSessionToken(token, SECRET)).resolves.toEqual({
      id,
      hcaId: "ident!abc123",
      email: "ada@example.com",
      name: "Ada Lovelace",
      slackId: "U0ADA",
      yswsEligible: true,
    });
  });

  it("returns null when there is no token", async () => {
    await expect(userFromSessionToken(undefined, SECRET)).resolves.toBeNull();
    await expect(userFromSessionToken("", SECRET)).resolves.toBeNull();
  });

  it("returns null for a token signed with another secret", async () => {
    const id = await createUser();
    const token = signSession({ uid: id }, "another-secret-another-secret-123456");
    await expect(userFromSessionToken(token, SECRET)).resolves.toBeNull();
  });

  it("returns null for a tampered or malformed token", async () => {
    const id = await createUser();
    const token = signSession({ uid: id }, SECRET);
    await expect(userFromSessionToken(token + "x", SECRET)).resolves.toBeNull();
    await expect(userFromSessionToken("not.a.token", SECRET)).resolves.toBeNull();
  });

  it("returns null for an expired token", async () => {
    const id = await createUser();
    const issuedLongAgo = Date.now() - 31 * DAY;
    const token = signSession({ uid: id }, SECRET, issuedLongAgo);
    await expect(userFromSessionToken(token, SECRET)).resolves.toBeNull();
  });

  it("returns null when the user no longer exists", async () => {
    const id = await createUser();
    const token = signSession({ uid: id }, SECRET);
    await getPool().query("DELETE FROM users WHERE id = $1", [id]);
    await expect(userFromSessionToken(token, SECRET)).resolves.toBeNull();
  });

  it("stores missing optional fields as null", async () => {
    const { id } = await upsertUser({ sub: "ident!min", email: "min@example.com" });
    const token = signSession({ uid: id }, SECRET);
    await expect(userFromSessionToken(token, SECRET)).resolves.toMatchObject({
      id,
      name: null,
      slackId: null,
      yswsEligible: null,
    });
  });

  it("returns a plain number id, not a string", async () => {
    const id = await createUser();
    const token = signSession({ uid: id }, SECRET);
    const user = await userFromSessionToken(token, SECRET);
    expect(typeof user?.id).toBe("number");
  });
});
