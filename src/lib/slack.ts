const AVATAR_HOSTS = new Set(["avatars.slack-edge.com", "secure.gravatar.com", "a.slack-edge.com"]);

export function isSlackAvatarUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && AVATAR_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

// Needs the users:read scope. Any failure returns null so login never waits on Slack.
export async function fetchSlackAvatar(slackId: string | null | undefined): Promise<string | null> {
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
    const body = (await res.json()) as { ok?: boolean; user?: { profile?: { image_192?: unknown; image_72?: unknown } } };
    if (!body.ok) return null;
    const image = body.user?.profile?.image_192 ?? body.user?.profile?.image_72;
    return isSlackAvatarUrl(image) ? image : null;
  } catch {
    return null;
  }
}
