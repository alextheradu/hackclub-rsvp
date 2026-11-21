import { rootDomain } from "@/lib/domain";
import { formatEventWhen } from "@/lib/format";
import { escapeSlack } from "@/lib/slack";
import { validateSlug } from "@/lib/slug";

// Only links on our own domain unfurl: slug.root, events.root/slug and
// root/slug. Custom domains can't be registered with Slack (5-domain cap).
export function parseEventLink(
  link: string,
  root: string = rootDomain(),
): string | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.port || url.username || url.password) return null;

  const host = url.hostname;
  const path = url.pathname.replace(/\/+$/, "");
  let slug: string | undefined;
  if (host === root || host === `events.${root}`) {
    slug = path.match(/^\/([^/]+)$/)?.[1];
  } else if (host.endsWith(`.${root}`) && path === "") {
    slug = host.slice(0, -(root.length + 1));
  }
  return slug && validateSlug(slug).ok ? slug : null;
}

export type UnfurlEvent = {
  id: number;
  title: string;
  orgName: string;
  startsAt: Date;
  endsAt: Date | null;
  timezone: string;
  locationDisplay: string | null;
  capacity: number | null;
  confirmed: number;
  cancelled: boolean;
  ended: boolean;
};

type TextObject = { type: "plain_text" | "mrkdwn"; text: string };
type Button = {
  type: "button";
  text: TextObject;
  action_id: string;
  value?: string;
  url?: string;
  style?: "primary";
};
export type SlackBlock =
  | { type: "section"; text: TextObject }
  | { type: "context"; elements: TextObject[] }
  | { type: "actions"; elements: Button[] };

export type UnfurlPayload = { blocks: SlackBlock[] };

function availability(event: UnfurlEvent): string | null {
  if (event.cancelled) return "This event was cancelled.";
  if (event.ended) return "RSVPs are closed.";
  if (event.capacity === null) return null;
  const left = Math.max(event.capacity - event.confirmed, 0);
  if (left === 0) return "Full. RSVP to join the waitlist.";
  return `${left} ${left === 1 ? "spot" : "spots"} left`;
}

export function buildUnfurl(event: UnfurlEvent, url: string): UnfurlPayload {
  const details = [
    formatEventWhen(event.startsAt, event.endsAt, event.timezone),
    event.locationDisplay,
    availability(event),
  ].filter((part): part is string => Boolean(part));

  const blocks: SlackBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*<${url}|${escapeSlack(event.title)}>*\n${escapeSlack(event.orgName)}`,
      },
    },
    {
      type: "context",
      elements: details.map((text) => ({ type: "plain_text", text })),
    },
  ];

  const buttons: Button[] = [];
  if (!event.cancelled && !event.ended) {
    const full = event.capacity !== null && event.confirmed >= event.capacity;
    buttons.push({
      type: "button",
      text: { type: "plain_text", text: full ? "Join waitlist" : "RSVP" },
      action_id: "rsvp",
      value: String(event.id),
      style: "primary",
    });
  }
  buttons.push({
    type: "button",
    text: { type: "plain_text", text: "View event" },
    action_id: "view_event",
    url,
  });
  blocks.push({ type: "actions", elements: buttons });

  return { blocks };
}
