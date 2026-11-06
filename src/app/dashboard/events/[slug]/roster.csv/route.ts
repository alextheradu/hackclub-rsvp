import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEventBySlug } from "@/lib/events";
import { hit, tooManyRequests } from "@/lib/ratelimit";
import { getRoster } from "@/lib/roster";
import { rosterCsv } from "@/lib/roster-csv";
import { validateSlug } from "@/lib/slug";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/dashboard/events/[slug]/roster.csv">,
) {
  const { slug } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?returnTo=/dashboard/events/${slug}`);
  if (!(await hit(`roster-csv:user:${user.id}`, 30, 60)).allowed) {
    return tooManyRequests();
  }

  const event = validateSlug(slug).ok ? await getEventBySlug(slug) : null;
  if (!event) return new Response("Not found", { status: 404 });

  const roster = await getRoster(user.id, event.id);
  if (!roster) return new Response("Not found", { status: 404 });

  // BOM so Excel reads names as UTF-8.
  return new Response(`﻿${rosterCsv(roster)}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${event.slug}-roster.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
