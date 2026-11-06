import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSlackAvatar, isSlackAvatarUrl } from "@/lib/slack";

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
