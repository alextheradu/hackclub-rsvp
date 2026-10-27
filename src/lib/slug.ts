export type SlugResult = { ok: true } | { ok: false; reason: "format" | "reserved" };

export type EventKind = "ysws" | "irl";

const SLUG_FORMAT = /^[a-z0-9-]{3,40}$/;
const RESERVED = new Set(["www", "origin", "domains", "events", "dev", "app", "admin", "mail", "static", "api", "assets", "e", "login", "logout", "dashboard", "oauth"])
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

// Subdomains (slug.hackclub.rsvp, events.hackclub.rsvp/slug) still route in
// hosts.ts, but they can't be tested yet, so links use hackclub.rsvp/slug.
export function eventUrl(
  event: { kind: EventKind; slug: string },
  root: string = ROOT_DOMAIN,
): string {
  return `https://${root}/${event.slug}`;
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
