import { after } from "next/server";
import {
  replyEphemeral,
  rsvpFromSlack,
  type InteractionPayload,
} from "@/lib/slack-links";
import { verifySlackRequest } from "@/lib/slack-verify";

type BlockActions = InteractionPayload & {
  type?: string;
  actions?: { action_id?: string; value?: unknown }[];
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

export async function POST(request: Request) {
  const body = await request.text();
  if (!verifySlackRequest(request, body)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: BlockActions;
  try {
    const raw = new URLSearchParams(body).get("payload");
    if (!raw) throw new Error("missing payload");
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const action = payload.actions?.find((a) => a.action_id === "rsvp");
  const slackUserId = payload.user?.id;
  // Slack wants a 200 within 3 seconds; RSVP and reply after responding.
  if (payload.type === "block_actions" && action && slackUserId) {
    after(async () => {
      try {
        const text = await rsvpFromSlack(slackUserId, action.value);
        await replyEphemeral(payload, text);
      } catch (error) {
        console.error("slack rsvp failed:", errorMessage(error));
      }
    });
  }

  return new Response(null, { status: 200 });
}
