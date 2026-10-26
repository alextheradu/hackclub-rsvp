export type SlugResult = { ok: true } | { ok: false; reason: "format" | "reserved" };

export type EventKind = "ysws" | "irl";

const SLUG_FORMAT = /^[a-z0-9-]{3,40}$/;
const RESERVED = new Set(["www", "origin", "domains", "events", "dev", "app", "admin", "mail", "static", "api", "assets"])
export function validateSlug(slug: string): SlugResult {
  if(!SLUG_FORMAT.test(slug)) {
    return { ok: false, reason: "format" };
  }
  if(RESERVED.has(slug)) {
    return { ok: false, reason: "reserved" };
  }
  return { ok: true };
}

const ROOT_DOMAIN = "hackclub.rsvp"

export function eventUrl(event: { kind: EventKind; slug: string }): string {
  if (event.kind === "ysws") {
    return `https://${event.slug}.${ROOT_DOMAIN}`;
  }
  return `https://events.${ROOT_DOMAIN}/${event.slug}`;
}

export function unfurlUrl(slug: string): string {
  return `https://${ROOT_DOMAIN}/${slug}`;
}

export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}
