import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchSlackAvatar,
  inviteToChannel,
  isSlackAvatarUrl,
  postDm,
  SlackError,
  slackApi,
} from "@/lib/slack";

const AVATAR = "https://avatars.slack-edge.com/2026-01-01/abc_192.png";

function slackReplies(body: unknown, status = 200) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test-token");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("fetchSlackAvatar", () => {
  it("asks users.info for the user with the bot token and returns image_192", async () => {
    const fetchMock = slackReplies({
      ok: true,
      user: {
        profile: {
          image_72: "https://avatars.slack-edge.com/72.png",
          image_192: AVATAR,
        },
      },
    });
    await expect(fetchSlackAvatar("U0ADA")).resolves.toBe(AVATAR);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://slack.com/api/users.info?user=U0ADA");
    expect(init.headers).toEqual({ Authorization: "Bearer xoxb-test-token" });
  });

  it("falls back to image_72", async () => {
    slackReplies({ ok: true, user: { profile: { image_72: AVATAR } } });
    await expect(fetchSlackAvatar("U0ADA")).resolves.toBe(AVATAR);
  });

  it("returns null without calling Slack when there is no token or Slack ID", async () => {
    const fetchMock = slackReplies({ ok: true });
    await expect(fetchSlackAvatar(null)).resolves.toBeNull();
    await expect(fetchSlackAvatar("not an id")).resolves.toBeNull();
    vi.stubEnv("SLACK_BOT_TOKEN", "");
    await expect(fetchSlackAvatar("U0ADA")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null when Slack says not ok", async () => {
    slackReplies({ ok: false, error: "user_not_found" });
    await expect(fetchSlackAvatar("U0ADA")).resolves.toBeNull();
  });

  it("returns null on HTTP errors and network failures", async () => {
    slackReplies({}, 500);
    await expect(fetchSlackAvatar("U0ADA")).resolves.toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    await expect(fetchSlackAvatar("U0ADA")).resolves.toBeNull();
  });

  it("rejects image URLs from hosts Slack doesn't use", async () => {
    slackReplies({
      ok: true,
      user: { profile: { image_192: "https://evil.example/a.png" } },
    });
    await expect(fetchSlackAvatar("U0ADA")).resolves.toBeNull();
  });
});

describe("isSlackAvatarUrl", () => {
  it("accepts https Slack and Gravatar URLs only", () => {
    expect(isSlackAvatarUrl(AVATAR)).toBe(true);
    expect(isSlackAvatarUrl("https://secure.gravatar.com/avatar/x.jpg")).toBe(
      true,
    );
    expect(isSlackAvatarUrl("http://avatars.slack-edge.com/a.png")).toBe(false);
    expect(isSlackAvatarUrl("javascript:alert(1)")).toBe(false);
    expect(isSlackAvatarUrl(42)).toBe(false);
  });
});

async function slackErrorFrom(promise: Promise<unknown>): Promise<SlackError> {
  const error = await promise.then(
    () => {
      throw new Error("expected a SlackError");
    },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(SlackError);
  return error as SlackError;
}

describe("slackApi", () => {
  it("POSTs JSON to the method with the bot token in the Authorization header only", async () => {
    const fetchMock = slackReplies({ ok: true, ts: "1.2" });
    await expect(
      slackApi("chat.postMessage", { channel: "U0ADA", text: "hi" }),
    ).resolves.toEqual({ ok: true, ts: "1.2" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://slack.com/api/chat.postMessage");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: "Bearer xoxb-test-token",
      "Content-Type": "application/json; charset=utf-8",
    });
    expect(JSON.parse(init.body)).toEqual({ channel: "U0ADA", text: "hi" });
    expect(String(url)).not.toContain("xoxb");
    expect(init.body).not.toContain("xoxb");
  });

  it("throws a permanent SlackError carrying Slack's error code", async () => {
    slackReplies({ ok: false, error: "user_not_found" });
    const error = await slackErrorFrom(
      slackApi("conversations.invite", { channel: "C1", users: "U0ADA" }),
    );
    expect(error.code).toBe("user_not_found");
    expect(error.retryable).toBe(false);
  });

  it.each(["ratelimited", "rate_limited", "internal_error", "fatal_error"])(
    "treats %s as retryable",
    async (code) => {
      slackReplies({ ok: false, error: code });
      const error = await slackErrorFrom(slackApi("chat.postMessage", {}));
      expect(error.code).toBe(code);
      expect(error.retryable).toBe(true);
    },
  );

  it.each([429, 500, 503])("treats HTTP %i as retryable", async (status) => {
    slackReplies({}, status);
    const error = await slackErrorFrom(slackApi("chat.postMessage", {}));
    expect(error.code).toBe(`http_${status}`);
    expect(error.retryable).toBe(true);
  });

  it("treats a network failure as retryable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    const error = await slackErrorFrom(slackApi("chat.postMessage", {}));
    expect(error.code).toBe("network");
    expect(error.retryable).toBe(true);
  });

  it("never puts the token in the error message", async () => {
    slackReplies({ ok: false, error: "invalid_auth" });
    const error = await slackErrorFrom(slackApi("chat.postMessage", {}));
    expect(error.message).not.toContain("xoxb");
  });

  it("fails without calling Slack when SLACK_BOT_TOKEN is missing", async () => {
    const fetchMock = slackReplies({ ok: true });
    vi.stubEnv("SLACK_BOT_TOKEN", "");
    const error = await slackErrorFrom(slackApi("chat.postMessage", {}));
    expect(error.code).toBe("no_token");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("postDm", () => {
  it("posts to the user's ID so Slack opens the DM", async () => {
    const fetchMock = slackReplies({ ok: true });
    await postDm("U0ADA", "You're in!");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://slack.com/api/chat.postMessage");
    expect(JSON.parse(init.body)).toEqual({
      channel: "U0ADA",
      text: "You're in!",
    });
  });
});

describe("inviteToChannel", () => {
  it("invites one user and returns ok", async () => {
    const fetchMock = slackReplies({ ok: true });
    await expect(inviteToChannel("C0EVENT", "U0ADA")).resolves.toBe("ok");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://slack.com/api/conversations.invite");
    expect(JSON.parse(init.body)).toEqual({
      channel: "C0EVENT",
      users: "U0ADA",
    });
  });

  it("counts already_in_channel as success", async () => {
    slackReplies({ ok: false, error: "already_in_channel" });
    await expect(inviteToChannel("C0EVENT", "U0ADA")).resolves.toBe(
      "already_in",
    );
  });

  it("rethrows other errors", async () => {
    slackReplies({ ok: false, error: "not_in_channel" });
    const error = await slackErrorFrom(inviteToChannel("C0EVENT", "U0ADA"));
    expect(error.code).toBe("not_in_channel");
    expect(error.retryable).toBe(false);
  });
});
