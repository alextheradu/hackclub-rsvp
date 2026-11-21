import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, getPool } from "@/lib/db";
import { inviteExistingUsers, onFirstLogin } from "@/lib/organizer-invite";
import { runMigrations } from "../scripts/migrate.mjs";
import { resetDb, wipeSchema } from "./helpers/db";

const CHANNEL = "C0ORGANIZERS";

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

async function makeUser(slackId: string | null): Promise<number> {
  const { rows } = await getPool().query(
    "INSERT INTO users (hca_id, email, slack_id) VALUES ('ident!a', 'ada@example.com', $1) RETURNING id",
    [slackId],
  );
  return Number(rows[0].id);
}

async function outboxRows() {
  const { rows } = await getPool().query(
    "SELECT channel, kind, payload, dedupe_key FROM outbox ORDER BY id",
  );
  return rows;
}

describe("onFirstLogin", () => {
  it("queues one organizer channel invite for a new user with a Slack ID", async () => {
    const id = await makeUser("U0ADA");
    expect(await onFirstLogin({ id, isNew: true }, "U0ADA", CHANNEL)).toBe(
      true,
    );
    expect(await outboxRows()).toEqual([
      {
        channel: "slack",
        kind: "organizer_invite",
        payload: { userId: id, channelId: CHANNEL },
        dedupe_key: `organizer_invite:${id}`,
      },
    ]);
  });

  it("does nothing for a returning user", async () => {
    const id = await makeUser("U0ADA");
    expect(await onFirstLogin({ id, isNew: false }, "U0ADA", CHANNEL)).toBe(
      false,
    );
    expect(await outboxRows()).toEqual([]);
  });

  it("does nothing for a user without a Slack ID", async () => {
    const id = await makeUser(null);
    expect(await onFirstLogin({ id, isNew: true }, null, CHANNEL)).toBe(false);
    expect(await outboxRows()).toEqual([]);
  });

  it("does nothing when no organizer channel is configured", async () => {
    const id = await makeUser("U0ADA");
    expect(await onFirstLogin({ id, isNew: true }, "U0ADA", undefined)).toBe(
      false,
    );
    expect(await onFirstLogin({ id, isNew: true }, "U0ADA", "")).toBe(false);
    expect(await outboxRows()).toEqual([]);
  });

  it("never queues a second invite for the same user", async () => {
    const id = await makeUser("U0ADA");
    await onFirstLogin({ id, isNew: true }, "U0ADA", CHANNEL);
    expect(await onFirstLogin({ id, isNew: true }, "U0ADA", CHANNEL)).toBe(
      false,
    );
    expect(await outboxRows()).toHaveLength(1);
  });
});

describe("inviteExistingUsers", () => {
  async function makeUsers(slackIds: (string | null)[]): Promise<number[]> {
    const ids: number[] = [];
    for (const [i, slackId] of slackIds.entries()) {
      const { rows } = await getPool().query(
        "INSERT INTO users (hca_id, email, slack_id) VALUES ($1, $2, $3) RETURNING id",
        [`ident!${i}`, `user${i}@example.com`, slackId],
      );
      ids.push(Number(rows[0].id));
    }
    return ids;
  }

  it("queues an invite for every existing user with a Slack ID", async () => {
    const [a, , c] = await makeUsers(["U0A", null, "U0C"]);
    expect(await inviteExistingUsers(CHANNEL)).toBe(2);
    expect(await outboxRows()).toEqual([
      {
        channel: "slack",
        kind: "organizer_invite",
        payload: { userId: a, channelId: CHANNEL },
        dedupe_key: `organizer_invite:${a}`,
      },
      {
        channel: "slack",
        kind: "organizer_invite",
        payload: { userId: c, channelId: CHANNEL },
        dedupe_key: `organizer_invite:${c}`,
      },
    ]);
  });

  it("skips people already invited at first login", async () => {
    const [a, b] = await makeUsers(["U0A", "U0B"]);
    await onFirstLogin({ id: a, isNew: true }, "U0A", CHANNEL);
    expect(await inviteExistingUsers(CHANNEL)).toBe(1);
    const keys = (await outboxRows()).map((row) => row.dedupe_key);
    expect(keys).toEqual([`organizer_invite:${a}`, `organizer_invite:${b}`]);
  });

  it("is safe to run on every startup", async () => {
    await makeUsers(["U0A", "U0B"]);
    expect(await inviteExistingUsers(CHANNEL)).toBe(2);
    expect(await inviteExistingUsers(CHANNEL)).toBe(0);
    expect(await outboxRows()).toHaveLength(2);
  });

  it("picks up someone who added a Slack ID after their first login", async () => {
    const [a] = await makeUsers([null]);
    expect(await inviteExistingUsers(CHANNEL)).toBe(0);
    await getPool().query("UPDATE users SET slack_id = 'U0A' WHERE id = $1", [
      a,
    ]);
    expect(await inviteExistingUsers(CHANNEL)).toBe(1);
  });

  it("does nothing when no organizer channel is configured", async () => {
    await makeUsers(["U0A"]);
    expect(await inviteExistingUsers(undefined)).toBe(0);
    expect(await inviteExistingUsers("")).toBe(0);
    expect(await outboxRows()).toEqual([]);
  });
});
