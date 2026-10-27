export const DEFAULT_ROOT_DOMAIN = "hackclub.rsvp";

// Server-only. Set ROOT_DOMAIN (e.g. dev.hackclub.rsvp) to serve the app from another host.
export function rootDomain(): string {
  return process.env.ROOT_DOMAIN?.trim().toLowerCase() || DEFAULT_ROOT_DOMAIN;
}
