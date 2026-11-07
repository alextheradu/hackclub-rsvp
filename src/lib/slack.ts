const AVATAR_HOSTS = new Set([
  "avatars.slack-edge.com",
  "secure.gravatar.com",
  "a.slack-edge.com",
]);

export function isSlackAvatarUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && AVATAR_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export async function fetchSlackAvatar(
  slackId: string | null | undefined,
): Promise<string | null> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token || !slackId || !/^[UW][A-Z0-9]+$/.test(slackId)) return null;

  try {
    const url = new URL("https://slack.com/api/users.info");
    url.searchParams.set("user", slackId);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      ok?: boolean;
      user?: { profile?: { image_192?: unknown; image_72?: unknown } };
    };
    if (!body.ok) return null;
    const image = body.user?.profile?.image_192 ?? body.user?.profile?.image_72;
    return isSlackAvatarUrl(image) ? image : null;
  } catch {
    return null;
  }
}

const RETRYABLE = new Set([
  "ratelimited",
  "rate_limited",
  "internal_error",
  "fatal_error",
]);

export class SlackError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(`slack: ${code}`);
    this.name = "SlackError";
  }
}

export async function slackApi<T = Record<string, unknown>>(
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new SlackError("no_token", false);

  let res: Response;
  try {
    res = await fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new SlackError("network", true);
  }
  if (!res.ok) throw new SlackError(`http_${res.status}`, true);
  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!data.ok) {
    const code = data.error ?? "unknown_error";
    throw new SlackError(code, RETRYABLE.has(code));
  }
  return data as T;
}

export async function inviteToChannel(channelId: string, slackId: string) {
  try {
    await slackApi("conversations.invite", {
      channel: channelId,
      users: slackId,
    });
    return "ok" as const;
  } catch (error) {
    if (error instanceof SlackError && error.code === "already_in_channel") {
      return "already_in" as const;
    }
    throw error;
  }
}

export async function postDm(slackId: string, text: string): Promise<void> {
  await slackApi("chat.postMessage", {
    channel: slackId,
    text,
  });
}
