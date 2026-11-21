import { q, sql } from "@/lib/db";
import { rootDomain } from "@/lib/domain";
import { hit, RATE_LIMIT_MESSAGE } from "@/lib/ratelimit";
import { createRsvp, RSVP_ERROR_MESSAGES } from "@/lib/rsvps";
import { escapeSlack, slackApi } from "@/lib/slack";
import {
  buildUnfurl,
  parseEventLink,
  type UnfurlEvent,
  type UnfurlPayload,
} from "@/lib/unfurl";

// Slack sends at most a handful of links per message; cap it anyway.
const MAX_LINKS = 10;

export type LinkSharedEvent = {
  type: "link_shared";
  channel?: string;
  message_ts?: string;
  unfurl_id?: string;
  source?: string;
  links?: { domain?: string; url?: string }[];
};

export type ChatUnfurl = (args: Record<string, unknown>) => Promise<unknown>;

const realChatUnfurl: ChatUnfurl = (args) => slackApi("chat.unfurl", args);

async function loadUnfurlEvent(slug: string): Promise<UnfurlEvent | null> {
  const row = await q().maybe<{
    id: string;
    title: string;
    org_name: string;
    starts_at: Date;
    ends_at: Date | null;
    timezone: string;
    location_display: string | null;
    capacity: number | null;
    confirmed: number;
    cancelled: boolean;
    ended: boolean;
  }>(sql`
    SELECT e.id, e.title, o.name AS org_name, e.starts_at, e.ends_at, e.timezone,
           e.location_display, e.capacity,
           (SELECT count(*)::int FROM rsvps r
            WHERE r.event_id = e.id AND r.status = 'confirmed') AS confirmed,
           e.cancelled_at IS NOT NULL AS cancelled,
           coalesce(e.ends_at, e.starts_at) < now() AS ended
    FROM events e
    JOIN orgs o ON o.id = e.org_id
    WHERE e.slug = ${slug}`);
  if (!row) return null;
  return {
    id: Number(row.id),
    title: row.title,
    orgName: row.org_name,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone,
    locationDisplay: row.location_display,
    capacity: row.capacity,
    confirmed: row.confirmed,
    cancelled: row.cancelled,
    ended: row.ended,
  };
}

// Composer previews have no real message yet, so Slack wants unfurl_id+source;
// posted messages can use either form.
function unfurlTarget(event: LinkSharedEvent): Record<string, string> | null {
  if (event.unfurl_id && event.source) {
    return { unfurl_id: event.unfurl_id, source: event.source };
  }
  if (event.channel && event.message_ts) {
    return { channel: event.channel, ts: event.message_ts };
  }
  return null;
}

export async function unfurlLinks(
  event: LinkSharedEvent,
  chatUnfurl: ChatUnfurl = realChatUnfurl,
  root: string = rootDomain(),
): Promise<number> {
  const target = unfurlTarget(event);
  if (!target) return 0;

  const urls = [
    ...new Set(
      (event.links ?? [])
        .map((link) => link.url)
        .filter((url): url is string => typeof url === "string"),
    ),
  ].slice(0, MAX_LINKS);

  const unfurls: Record<string, UnfurlPayload> = {};
  const cache = new Map<string, UnfurlEvent | null>();
  for (const url of urls) {
    const slug = parseEventLink(url, root);
    if (!slug) continue;
    if (!cache.has(slug)) cache.set(slug, await loadUnfurlEvent(slug));
    const found = cache.get(slug);
    if (found) unfurls[url] = buildUnfurl(found, url);
  }

  const count = Object.keys(unfurls).length;
  if (count > 0) await chatUnfurl({ ...target, unfurls });
  return count;
}

function parseEventId(value: unknown): number | null {
  if (typeof value !== "string" || !/^[1-9]\d{0,15}$/.test(value)) return null;
  return Number(value);
}

export async function rsvpFromSlack(
  slackUserId: string,
  eventValue: unknown,
  root: string = rootDomain(),
): Promise<string> {
  const eventId = parseEventId(eventValue);
  const event =
    eventId === null
      ? undefined
      : await q().maybe<{ slug: string; title: string }>(sql`
          SELECT slug, title FROM events WHERE id = ${eventId}`);
  if (eventId === null || !event) {
    return "Sorry, we couldn't find that event. It may have been deleted.";
  }

  const user = await q().maybe<{ id: string }>(sql`
    SELECT id FROM users WHERE slack_id = ${slackUserId}
    ORDER BY last_login_at DESC NULLS LAST, id DESC
    LIMIT 1`);
  if (!user) {
    const login = `https://${root}/login?returnTo=${encodeURIComponent(`/${event.slug}`)}`;
    return `You need to sign in to ${root} once before you can RSVP from Slack. <${login}|Sign in and RSVP>`;
  }

  const userId = Number(user.id);
  if (!(await hit(`rsvp:user:${userId}`, 10, 60)).allowed) {
    return RATE_LIMIT_MESSAGE;
  }

  const result = await createRsvp(eventId, userId);
  if ("error" in result) return RSVP_ERROR_MESSAGES[result.error];
  const title = escapeSlack(event.title);
  const url = `https://${root}/${event.slug}`;
  if (result.status === "waitlisted") {
    return `You're on the waitlist for *<${url}|${title}>*. We'll let you know if a spot opens up.`;
  }
  return `You're going to *<${url}|${title}>*! Check your email for the details.`;
}

export type InteractionPayload = {
  response_url?: string;
  user: { id: string };
  channel?: { id?: string };
};

export type ReplyDeps = {
  fetch: typeof fetch;
  slackApi: (method: string, body: Record<string, unknown>) => Promise<unknown>;
};

const REAL_REPLY: ReplyDeps = { fetch, slackApi };

// Only Slack's own webhook host, so a forged response_url can't make us POST
// elsewhere even if a signed payload were somehow tampered with.
function isSlackResponseUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "hooks.slack.com";
  } catch {
    return false;
  }
}

export async function replyEphemeral(
  payload: InteractionPayload,
  text: string,
  deps: ReplyDeps = REAL_REPLY,
): Promise<void> {
  if (isSlackResponseUrl(payload.response_url)) {
    await deps.fetch(payload.response_url, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        text,
        response_type: "ephemeral",
        replace_original: false,
      }),
      signal: AbortSignal.timeout(10000),
    });
    return;
  }
  if (!payload.channel?.id) return;
  await deps.slackApi("chat.postEphemeral", {
    channel: payload.channel.id,
    user: payload.user.id,
    text,
  });
}
