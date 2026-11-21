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
import {
  replyEphemeral,
  type ChatUnfurl,
  rsvpFromSlack,
  unfurlLinks,
  type LinkSharedEvent,
} from "@/lib/slack-links";
import { runMigrations } from "../scripts/migrate.mjs";
import { resetDb, wipeSchema } from "./helpers/db";

const ROOT = "hackclub.rsvp";

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

async function setup(
  opts: {
    capacity?: number | null;
    requiresVerification?: boolean;
    startsIn?: string;
  } = {},
) {
  const pool = getPool();
  const users = await pool.query(
    `INSERT INTO users (hca_id, email, name, slack_id, ysws_eligible) VALUES
       ('ident!a', 'ada@example.com', 'Ada', 'U0ADA', true),
       ('ident!b', 'grace@example.com', 'Grace', 'U0GRACE', false),
       ('ident!o', 'org@example.com', 'Olive', 'U0OLIVE', true)
     RETURNING id`,
  );
  const org = await pool.query(
    "INSERT INTO orgs (name, slug) VALUES ('Hack Club', 'hack-club') RETURNING id",
  );
  await pool.query(
    "INSERT INTO org_members (org_id, user_id, role) VALUES ($1, $2, 'owner')",
    [org.rows[0].id, users.rows[2].id],
  );
  const event = await pool.query(
    `INSERT INTO events (org_id, slug, title, starts_at, kind, capacity, timezone,
                         location_display, requires_verification)
     VALUES ($1, 'hack-night', 'Hack Night', now() + $2::interval, 'irl', $3, 'UTC',
             'HQ', $4)
     RETURNING id`,
    [
      org.rows[0].id,
      opts.startsIn ?? "7 days",
      opts.capacity ?? null,
      opts.requiresVerification ?? false,
    ],
  );
  return {
    ada: Number(users.rows[0].id),
    grace: Number(users.rows[1].id),
    eventId: Number(event.rows[0].id),
  };
}

function linkEvent(
  links: string[],
  extra: Partial<LinkSharedEvent> = {},
): LinkSharedEvent {
  return {
    type: "link_shared",
    channel: "C0CHAN",
    message_ts: "1700000000.000100",
    unfurl_id: "U0ADA-abc",
    source: "conversations_history",
    links: links.map((url) => ({ domain: "hackclub.rsvp", url })),
    ...extra,
  };
}

describe("unfurlLinks", () => {
  it("unfurls an event link using unfurl_id and source", async () => {
    const { eventId } = await setup({ capacity: 10 });
    const chatUnfurl = vi.fn<ChatUnfurl>(async () => ({}));
    const url = "https://hackclub.rsvp/hack-night";
    expect(await unfurlLinks(linkEvent([url]), chatUnfurl, ROOT)).toBe(1);
    expect(chatUnfurl).toHaveBeenCalledTimes(1);
    const args = chatUnfurl.mock.calls[0][0];
    expect(args).toMatchObject({
      unfurl_id: "U0ADA-abc",
      source: "conversations_history",
    });
    expect(args).not.toHaveProperty("channel");
    const unfurls = args.unfurls as Record<string, { blocks: unknown[] }>;
    expect(Object.keys(unfurls)).toEqual([url]);
    expect(JSON.stringify(unfurls[url])).toContain(`"value":"${eventId}"`);
    expect(JSON.stringify(unfurls[url])).toContain("10 spots left");
  });

  it("falls back to channel and ts when there is no unfurl_id", async () => {
    await setup();
    const chatUnfurl = vi.fn<ChatUnfurl>(async () => ({}));
    await unfurlLinks(
      linkEvent(["https://hack-night.hackclub.rsvp"], {
        unfurl_id: undefined,
        source: undefined,
      }),
      chatUnfurl,
      ROOT,
    );
    expect(chatUnfurl.mock.calls[0][0]).toMatchObject({
      channel: "C0CHAN",
      ts: "1700000000.000100",
    });
  });

  it("keys each unfurl by the exact URL Slack sent", async () => {
    await setup();
    const chatUnfurl = vi.fn<ChatUnfurl>(async () => ({}));
    const a = "https://hackclub.rsvp/hack-night";
    const b = "https://events.hackclub.rsvp/hack-night/";
    await unfurlLinks(linkEvent([a, b]), chatUnfurl, ROOT);
    const args = chatUnfurl.mock.calls[0][0];
    expect(Object.keys(args.unfurls as object).sort()).toEqual([a, b].sort());
  });

  it("counts confirmed RSVPs, not waitlisted or cancelled ones", async () => {
    const { ada, grace, eventId } = await setup({ capacity: 5 });
    await getPool().query(
      `INSERT INTO rsvps (event_id, user_id, status) VALUES
         ($1, $2, 'confirmed'), ($1, $3, 'cancelled')`,
      [eventId, ada, grace],
    );
    const chatUnfurl = vi.fn<ChatUnfurl>(async () => ({}));
    await unfurlLinks(
      linkEvent(["https://hackclub.rsvp/hack-night"]),
      chatUnfurl,
      ROOT,
    );
    expect(JSON.stringify(chatUnfurl.mock.calls[0][0])).toContain(
      "4 spots left",
    );
  });

  it("skips unknown slugs and foreign links, and calls nothing if none match", async () => {
    await setup();
    const chatUnfurl = vi.fn<ChatUnfurl>(async () => ({}));
    expect(
      await unfurlLinks(
        linkEvent([
          "https://hackclub.rsvp/no-such-event",
          "https://evil.com/hack-night",
        ]),
        chatUnfurl,
        ROOT,
      ),
    ).toBe(0);
    expect(chatUnfurl).not.toHaveBeenCalled();
  });

  it("does nothing without a way to address the message", async () => {
    await setup();
    const chatUnfurl = vi.fn<ChatUnfurl>(async () => ({}));
    await unfurlLinks(
      linkEvent(["https://hackclub.rsvp/hack-night"], {
        unfurl_id: undefined,
        source: undefined,
        channel: undefined,
      }),
      chatUnfurl,
      ROOT,
    );
    expect(chatUnfurl).not.toHaveBeenCalled();
  });
});

describe("rsvpFromSlack", () => {
  it("RSVPs the HCA user linked to the Slack user", async () => {
    const { ada, eventId } = await setup();
    const text = await rsvpFromSlack("U0ADA", String(eventId), ROOT);
    expect(text).toContain("You're going to");
    expect(text).toContain("Hack Night");
    const { rows } = await getPool().query("SELECT user_id, status FROM rsvps");
    expect(rows).toEqual([{ user_id: String(ada), status: "confirmed" }]);
  });

  it("queues the same confirmation notices as the web RSVP", async () => {
    const { eventId } = await setup();
    await rsvpFromSlack("U0ADA", String(eventId), ROOT);
    const { rows } = await getPool().query(
      "SELECT channel, kind FROM outbox ORDER BY id",
    );
    expect(rows).toContainEqual({ channel: "email", kind: "rsvp_confirmed" });
  });

  it("puts people on the waitlist when the event is full", async () => {
    const { grace, eventId } = await setup({ capacity: 1 });
    await getPool().query(
      "INSERT INTO rsvps (event_id, user_id, status) VALUES ($1, $2, 'confirmed')",
      [eventId, grace],
    );
    expect(await rsvpFromSlack("U0ADA", String(eventId), ROOT)).toContain(
      "waitlist",
    );
  });

  it("asks an unknown Slack user to sign in first, with a link back to the event", async () => {
    const { eventId } = await setup();
    const text = await rsvpFromSlack("U0NOBODY", String(eventId), ROOT);
    expect(text).toContain("sign in");
    expect(text).toContain(
      "https://hackclub.rsvp/login?returnTo=%2Fhack-night",
    );
    expect((await getPool().query("SELECT 1 FROM rsvps")).rowCount).toBe(0);
  });

  it("explains why when the RSVP is refused", async () => {
    const { eventId } = await setup({ requiresVerification: true });
    expect(await rsvpFromSlack("U0GRACE", String(eventId), ROOT)).toContain(
      "verified",
    );
    expect(await rsvpFromSlack("U0OLIVE", String(eventId), ROOT)).toContain(
      "your own event",
    );
  });

  it("says RSVPs are closed for an event that already ended", async () => {
    const { eventId } = await setup({ startsIn: "-2 days" });
    expect(await rsvpFromSlack("U0ADA", String(eventId), ROOT)).toContain(
      "closed",
    );
  });

  it.each(["999999", "abc", "", "1.5", "-1"])(
    "handles a bad or unknown event id %j",
    async (value) => {
      await setup();
      expect(await rsvpFromSlack("U0ADA", value, ROOT)).toContain(
        "couldn't find",
      );
    },
  );

  it("rate-limits repeated clicks", async () => {
    const { eventId } = await setup();
    let last = "";
    for (let i = 0; i < 11; i++) {
      last = await rsvpFromSlack("U0ADA", String(eventId), ROOT);
    }
    expect(last).toContain("rate-limited");
  });
});

describe("replyEphemeral", () => {
  it("posts to Slack's response_url when there is one", async () => {
    const fetchFn = vi.fn(async () => new Response("ok"));
    const api = vi.fn(async () => ({}));
    await replyEphemeral(
      {
        response_url: "https://hooks.slack.com/actions/T1/1/abc",
        user: { id: "U0ADA" },
        channel: { id: "C0CHAN" },
      },
      "hi",
      { fetch: fetchFn, slackApi: api },
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://hooks.slack.com/actions/T1/1/abc");
    expect(JSON.parse(init.body as string)).toEqual({
      text: "hi",
      response_type: "ephemeral",
      replace_original: false,
    });
    expect(api).not.toHaveBeenCalled();
  });

  it("never posts to a response_url outside hooks.slack.com", async () => {
    const fetchFn = vi.fn(async () => new Response("ok"));
    const api = vi.fn(async () => ({}));
    await replyEphemeral(
      {
        response_url: "https://evil.com/collect",
        user: { id: "U0ADA" },
        channel: { id: "C0CHAN" },
      },
      "hi",
      { fetch: fetchFn, slackApi: api },
    );
    expect(fetchFn).not.toHaveBeenCalled();
    expect(api).toHaveBeenCalledWith("chat.postEphemeral", {
      channel: "C0CHAN",
      user: "U0ADA",
      text: "hi",
    });
  });

  it("falls back to chat.postEphemeral without a response_url", async () => {
    const fetchFn = vi.fn(async () => new Response("ok"));
    const api = vi.fn(async () => ({}));
    await replyEphemeral(
      { user: { id: "U0ADA" }, channel: { id: "C0CHAN" } },
      "hi",
      { fetch: fetchFn, slackApi: api },
    );
    expect(api).toHaveBeenCalledWith("chat.postEphemeral", {
      channel: "C0CHAN",
      user: "U0ADA",
      text: "hi",
    });
  });
});
