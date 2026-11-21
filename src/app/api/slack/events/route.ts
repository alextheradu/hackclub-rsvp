import { after } from "next/server";
import { unfurlLinks, type LinkSharedEvent } from "@/lib/slack-links";
import { verifySlackRequest } from "@/lib/slack-verify";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

export async function POST(request: Request) {
  const body = await request.text();
  if (!verifySlackRequest(request, body)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let data: {
    type?: string;
    challenge?: unknown;
    event?: { type?: string };
  };
  try {
    data = JSON.parse(body);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  if (data.type === "url_verification" && typeof data.challenge === "string") {
    return new Response(data.challenge, {
      headers: { "Content-Type": "text/plain" },
    });
  }

  // Slack wants a 200 within 3 seconds, so unfurl after responding.
  if (data.type === "event_callback" && data.event?.type === "link_shared") {
    const event = data.event as LinkSharedEvent;
    after(async () => {
      try {
        await unfurlLinks(event);
      } catch (error) {
        console.error("slack unfurl failed:", errorMessage(error));
      }
    });
  }

  return new Response(null, { status: 200 });
}
