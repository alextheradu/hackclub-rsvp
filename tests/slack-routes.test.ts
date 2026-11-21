import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as events } from "@/app/api/slack/events/route";
import { POST as interactivity } from "@/app/api/slack/interactivity/route";

const SECRET = "test-signing-secret";
let saved: string | undefined;

beforeEach(() => {
  saved = process.env.SLACK_SIGNING_SECRET;
  process.env.SLACK_SIGNING_SECRET = SECRET;
});

afterEach(() => {
  if (saved === undefined) delete process.env.SLACK_SIGNING_SECRET;
  else process.env.SLACK_SIGNING_SECRET = saved;
});

function now(): string {
  return String(Math.floor(Date.now() / 1000));
}

function request(
  path: string,
  body: string,
  opts: { timestamp?: string; secret?: string; signed?: boolean } = {},
): Request {
  const timestamp = opts.timestamp ?? now();
  const headers = new Headers({ "x-slack-request-timestamp": timestamp });
  if (opts.signed !== false) {
    const digest = createHmac("sha256", opts.secret ?? SECRET)
      .update(`v0:${timestamp}:${body}`)
      .digest("hex");
    headers.set("x-slack-signature", `v0=${digest}`);
  }
  return new Request(`https://hackclub.rsvp${path}`, {
    method: "POST",
    headers,
    body,
  });
}

const CHALLENGE = JSON.stringify({
  type: "url_verification",
  token: "ignored",
  challenge: "3eZbrw1aBm2rZgRNFdxV2595E9CY3gmdALWMmHkvFXO7tYXAYM8P",
});

describe("POST /api/slack/events", () => {
  it("answers the url_verification challenge", async () => {
    const res = await events(request("/api/slack/events", CHALLENGE));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(
      "3eZbrw1aBm2rZgRNFdxV2595E9CY3gmdALWMmHkvFXO7tYXAYM8P",
    );
  });

  it("returns 401 for an unsigned request", async () => {
    const res = await events(
      request("/api/slack/events", CHALLENGE, { signed: false }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 for a bad signature", async () => {
    const res = await events(
      request("/api/slack/events", CHALLENGE, { secret: "wrong" }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 for a replayed request older than 5 minutes", async () => {
    const old = String(Math.floor(Date.now() / 1000) - 360);
    const res = await events(
      request("/api/slack/events", CHALLENGE, { timestamp: old }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 when no signing secret is configured", async () => {
    delete process.env.SLACK_SIGNING_SECRET;
    const res = await events(request("/api/slack/events", CHALLENGE));
    expect(res.status).toBe(401);
  });

  it("returns 400 for a signed body that isn't JSON", async () => {
    const res = await events(request("/api/slack/events", "not json"));
    expect(res.status).toBe(400);
  });

  it("acknowledges events it doesn't handle", async () => {
    const body = JSON.stringify({
      type: "event_callback",
      event: { type: "app_mention" },
    });
    const res = await events(request("/api/slack/events", body));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/slack/interactivity", () => {
  function form(payload: unknown): string {
    return new URLSearchParams({ payload: JSON.stringify(payload) }).toString();
  }

  it("returns 401 for an unsigned request", async () => {
    const body = form({ type: "block_actions", actions: [] });
    const res = await interactivity(
      request("/api/slack/interactivity", body, { signed: false }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 for a replayed request", async () => {
    const body = form({ type: "block_actions", actions: [] });
    const old = String(Math.floor(Date.now() / 1000) - 360);
    const res = await interactivity(
      request("/api/slack/interactivity", body, { timestamp: old }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when the payload is missing or not JSON", async () => {
    expect(
      (await interactivity(request("/api/slack/interactivity", "a=b"))).status,
    ).toBe(400);
    expect(
      (
        await interactivity(
          request("/api/slack/interactivity", "payload=%7Bnope"),
        )
      ).status,
    ).toBe(400);
  });

  it("acknowledges actions it doesn't handle", async () => {
    const body = form({
      type: "block_actions",
      user: { id: "U0ADA" },
      actions: [{ action_id: "something_else", value: "1" }],
    });
    const res = await interactivity(request("/api/slack/interactivity", body));
    expect(res.status).toBe(200);
  });
});
