import { getCurrentUser } from "@/lib/auth";
import { isEventSlugTaken } from "@/lib/events";
import { hit, RATE_LIMIT_MESSAGE } from "@/lib/ratelimit";
import { validateSlug, type SlugStatus } from "@/lib/slug";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!(await hit(`slug-check:user:${user.id}`, 60, 60)).allowed) {
    return Response.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
  }

  const slug = new URL(request.url).searchParams.get("slug") ?? "";
  const check = validateSlug(slug);
  let status: SlugStatus;
  if (!check.ok) status = check.reason;
  else status = (await isEventSlugTaken(slug)) ? "taken" : "ok";

  return Response.json(
    { status },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
