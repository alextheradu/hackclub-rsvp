import { rootDomain } from "@/lib/domain";
import { getEventBySlug } from "@/lib/events";
import { buildEventIcs } from "@/lib/ics";
import { eventUrl, validateSlug } from "@/lib/slug";

export async function GET(_request: Request, ctx: RouteContext<"/e/[slug]/calendar.ics">) {
  const { slug } = await ctx.params;
  const event = validateSlug(slug).ok ? await getEventBySlug(slug) : null;
  if (!event) return new Response("Not found", { status: 404 });

  const host = rootDomain();
  const body = buildEventIcs(event, {
    url: eventUrl(event, host),
    host,
    now: new Date(),
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${event.slug}.ics"`,
      "Cache-Control": "public, max-age=300",
    },
  });
}
