import { validateSlug } from "@/lib/slug";

const ROOT = "hackclub.rsvp";

function rewriteFirstSegment(pathname: string): string | null {
  const [, first, ...rest] = pathname.split("/");
  if (!first || !validateSlug(first).ok) return null;
  return ["/e", first, ...rest].join("/");
}

export function rewriteTarget(host: string, pathname: string): string | null {
  const hostname = host.toLowerCase().split(":")[0];

  if (hostname === ROOT || hostname === `events.${ROOT}`) {
    return rewriteFirstSegment(pathname);
  }

  if (hostname.endsWith(`.${ROOT}`)) {
    const subdomain = hostname.slice(0, -(ROOT.length + 1));
    if (!validateSlug(subdomain).ok) return null;
    return `/e/${subdomain}${pathname === "/" ? "" : pathname}`;
  }

  return null;
}
