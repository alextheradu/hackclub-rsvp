import { resolve } from "node:path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { closePool, getPool } from "@/lib/db";
import type { Eligibility } from "@/lib/eligibility";
import type { OutboxJob } from "@/lib/outbox";
import { cancelRsvp, createRsvp } from "@/lib/rsvps";
import { SlackError } from "@/lib/slack";
import { slackSender } from "@/lib/slack-sender";
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

function fakeSlack(eligibility: Eligibility = "eligible") {
  const dms: { slackId: string; text: string }[] = [];
  const invites: { channelId: string; slackId: string }[] = [];
  const deps = {
    postDm: vi.fn(async (slackId: string, text: string) => {
      dms.push({ slackId, text });
    }),
    inviteToChannel: vi.fn(async (channelId: string, slackId: string) => {
      invites.push({ channelId, slackId });
      return "ok" as const;
    }),
    checkEligibility: vi.fn(async () => eligibility),
  };
  return { dms, invites, deps };
}

function job(kind: string, rsvpId: number): OutboxJob {
  return { id: 1, channel: "slack", kind, payload: { rsvpId }, attempts: 1 };
}

async function setup(
  opts: {
    capacity?: number | null;
    channel?: string | null;
    requiresVerification?: boolean;
    title?: string;
  } = {},
) {
  const pool = getPool();
  const users = await pool.query(
    `INSERT INTO users (hca_id, email, name, slack_id, ysws_eligible) VALUES
       ('ident!a', 'ada@example.com', 'Ada', 'U0ADA', true),
       ('ident!b', 'grace@example.com', 'Grace', 'U0GRACE', true),
       ('ident!c', 'linus@example.com', 'Linus', NULL, true)
     RETURNING id`,
  );
  const org = await pool.query(
    "INSERT INTO orgs (name, slug) VALUES ('Hack Club', 'hack-club') RETURNING id",
  );
  const event = await pool.query(
    `INSERT INTO events (org_id, slug, title, starts_at, kind, capacity, timezone,
                         slack_channel_id, requires_verification)
     VALUES ($1, 'hack-night', $2, now() + interval '7 days', 'irl', $3, 'UTC', $4, $5)
     RETURNING id`,
    [
      org.rows[0].id,
      opts.title ?? "Hack Night",
      opts.capacity ?? null,
      opts.channel === undefined ? "C0EVENT" : opts.channel,
      opts.requiresVerification ?? false,
    ],
  );
  return {
    ada: Number(users.rows[0].id),
    grace: Number(users.rows[1].id),
    linus: Number(users.rows[2].id),
    eventId: Number(event.rows[0].id),
  };
}

async function rsvp(eventId: number, userId: number): Promise<number> {
  const result = await createRsvp(eventId, userId);
  if ("error" in result) throw new Error(result.error);
  return result.id;
}

describe("slackSender DMs", () => {
  it("DMs the attendee's Slack ID with the event title and link", async () => {
    const { ada, eventId } = await setup();
    const rsvpId = await rsvp(eventId, ada);
    const slack = fakeSlack();
    await slackSender(slack.deps)(job("rsvp_confirmed", rsvpId));

    expect(slack.dms).toHaveLength(1);
    expect(slack.dms[0].slackId).toBe("U0ADA");
    expect(slack.dms[0].text).toContain("Hack Night");
    expect(slack.dms[0].text).toContain("/hack-night");
  });

  it("escapes &, < and > in the title so it can't ping or link in Slack", async () => {
    const { ada, eventId } = await setup({ title: "<!channel> & <@U0EVIL>" });
    const rsvpId = await rsvp(eventId, ada);
    const slack = fakeSlack();
    await slackSender(slack.deps)(job("rsvp_confirmed", rsvpId));

    const text = slack.dms[0].text;
    expect(text).not.toContain("<!channel>");
    expect(text).not.toContain("<@U0EVIL>");
    expect(text).toContain("&lt;!channel&gt; &amp; &lt;@U0EVIL&gt;");
  });

  it("does nothing for a user without a Slack ID", async () => {
    const { linus, eventId } = await setup();
    const rsvpId = await rsvp(eventId, linus);
    const slack = fakeSlack();
    await slackSender(slack.deps)(job("rsvp_confirmed", rsvpId));
    expect(slack.deps.postDm).not.toHaveBeenCalled();
  });

  it("skips the DM when the RSVP was cancelled before sending", async () => {
    const { ada, eventId } = await setup();
    const rsvpId = await rsvp(eventId, ada);
    await cancelRsvp(eventId, ada);
    const slack = fakeSlack();
    await slackSender(slack.deps)(job("rsvp_confirmed", rsvpId));
    expect(slack.deps.postDm).not.toHaveBeenCalled();
  });

  it("skips the DM when notifications are off", async () => {
    const { ada, eventId } = await setup();
    const rsvpId = await rsvp(eventId, ada);
    await getPool().query(
      "UPDATE rsvps SET notifications_enabled = false WHERE id = $1",
      [rsvpId],
    );
    const slack = fakeSlack();
    await slackSender(slack.deps)(job("rsvp_confirmed", rsvpId));
    expect(slack.deps.postDm).not.toHaveBeenCalled();
  });

  it("only DMs the waitlist message while the person is still waitlisted", async () => {
    const { ada, grace, eventId } = await setup({ capacity: 1 });
    await rsvp(eventId, ada);
    const graceRsvp = await rsvp(eventId, grace);
    await cancelRsvp(eventId, ada);
    const slack = fakeSlack();
    const send = slackSender(slack.deps);
    await send(job("rsvp_waitlisted", graceRsvp));
    await send(job("waitlist_promoted", graceRsvp));
    expect(slack.dms).toHaveLength(1);
    expect(slack.dms[0].slackId).toBe("U0GRACE");
  });

  it("passes Slack errors through so the outbox can retry or fail them", async () => {
    const { ada, eventId } = await setup();
    const rsvpId = await rsvp(eventId, ada);
    const slack = fakeSlack();
    slack.deps.postDm.mockRejectedValueOnce(
      new SlackError("ratelimited", true),
    );
    await expect(
      slackSender(slack.deps)(job("rsvp_confirmed", rsvpId)),
    ).rejects.toMatchObject({ code: "ratelimited", retryable: true });
  });

  it("rejects an unknown kind as permanent", async () => {
    const slack = fakeSlack();
    await expect(
      slackSender(slack.deps)(job("mystery", 1)),
    ).rejects.toMatchObject({ retryable: false });
  });
});

describe("slackSender channel invites", () => {
  it("invites a confirmed attendee to the event's channel", async () => {
    const { ada, eventId } = await setup();
    const rsvpId = await rsvp(eventId, ada);
    const slack = fakeSlack();
    await slackSender(slack.deps)(job("channel_invite", rsvpId));
    expect(slack.invites).toEqual([{ channelId: "C0EVENT", slackId: "U0ADA" }]);
    expect(slack.deps.checkEligibility).not.toHaveBeenCalled();
  });

  it("does nothing when the event has no Slack channel", async () => {
    const { ada, eventId } = await setup({ channel: null });
    const rsvpId = await rsvp(eventId, ada);
    const slack = fakeSlack();
    await slackSender(slack.deps)(job("channel_invite", rsvpId));
    expect(slack.deps.inviteToChannel).not.toHaveBeenCalled();
  });

  it("does nothing for a waitlisted attendee", async () => {
    const { ada, grace, eventId } = await setup({ capacity: 1 });
    await rsvp(eventId, ada);
    const graceRsvp = await rsvp(eventId, grace);
    const slack = fakeSlack();
    await slackSender(slack.deps)(job("channel_invite", graceRsvp));
    expect(slack.deps.inviteToChannel).not.toHaveBeenCalled();
  });

  it("does nothing for a user without a Slack ID", async () => {
    const { linus, eventId } = await setup();
    const rsvpId = await rsvp(eventId, linus);
    const slack = fakeSlack();
    await slackSender(slack.deps)(job("channel_invite", rsvpId));
    expect(slack.deps.inviteToChannel).not.toHaveBeenCalled();
  });

  it("does nothing once the event is cancelled", async () => {
    const { ada, eventId } = await setup();
    const rsvpId = await rsvp(eventId, ada);
    await getPool().query(
      "UPDATE events SET cancelled_at = now() WHERE id = $1",
      [eventId],
    );
    const slack = fakeSlack();
    await slackSender(slack.deps)(job("channel_invite", rsvpId));
    expect(slack.deps.inviteToChannel).not.toHaveBeenCalled();
  });

  it("re-checks eligibility with HCA before inviting on verified-only events", async () => {
    const { ada, eventId } = await setup({ requiresVerification: true });
    const rsvpId = await rsvp(eventId, ada);
    const slack = fakeSlack("eligible");
    await slackSender(slack.deps)(job("channel_invite", rsvpId));
    expect(slack.deps.checkEligibility).toHaveBeenCalledWith("U0ADA");
    expect(slack.invites).toHaveLength(1);
  });

  it.each<Eligibility>(["not_eligible", "unknown"])(
    "never invites when HCA says %s, and fails the job permanently",
    async (eligibility) => {
      const { ada, eventId } = await setup({ requiresVerification: true });
      const rsvpId = await rsvp(eventId, ada);
      const slack = fakeSlack(eligibility);
      await expect(
        slackSender(slack.deps)(job("channel_invite", rsvpId)),
      ).rejects.toMatchObject({ retryable: false });
      expect(slack.deps.inviteToChannel).not.toHaveBeenCalled();
    },
  );
});
