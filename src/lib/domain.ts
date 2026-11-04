export const DEFAULT_ROOT_DOMAIN = "hackclub.rsvp";

export function rootDomain(): string {
  return process.env.ROOT_DOMAIN?.trim().toLowerCase() || DEFAULT_ROOT_DOMAIN;
}
