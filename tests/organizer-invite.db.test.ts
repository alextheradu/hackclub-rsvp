import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, getPool } from "@/lib/db";
import { onFirstLogin } from "@/lib/organizer-invite";
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
