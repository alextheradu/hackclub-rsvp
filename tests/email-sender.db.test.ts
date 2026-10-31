import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, getPool } from "@/lib/db";
import { emailSender } from "@/lib/email-sender";
import type { Mail } from "@/lib/mail";
import { runOutboxOnce } from "@/lib/outbox-worker";
import { cancelRsvp, createRsvp } from "@/lib/rsvps";
import { runMigrations } from "../scripts/migrate.mjs";
import { resetDb, wipeSchema } from "./helpers/db";

beforeAll(async () => {
  await wipeSchema();
  await runMigrations(getPool(), resolve(__dirname, "../migrations"));
});

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closePool();
});

function fakeTransport() {
  const sent: (Mail & { from: string })[] = [];
  return { sent, sendMail: async (mail: Mail & { from: string }) => void sent.push(mail) };
}

async function setup(capacity: number | null = null) {
  const pool = getPool();
  const users = await pool.query(
    `INSERT INTO users (hca_id, email, name) VALUES ('ident!a', 'ada@example.com', 'Ada'), ('ident!b', 'grace@example.com', 'Grace')
     RETURNING id`,
  );
  const org = await pool.query("INSERT INTO orgs (name, slug) VALUES ('Hack Club', 'hack-club') RETURNING id");
  const event = await pool.query(
    `INSERT INTO events (org_id, slug, title, starts_at, kind, capacity, timezone)
     VALUES ($1, 'hack-night', 'Hack Night', now() + interval '7 days', 'irl', $2, 'America/New_York') RETURNING id`,
    [org.rows[0].id, capacity],
  );
  return {
    ada: Number(users.rows[0].id),
    grace: Number(users.rows[1].id),
    eventId: Number(event.rows[0].id),
  };
}

describe("emailSender", () => {
  it("emails a confirmation to the attendee", async () => {
    const { ada, eventId } = await setup();
    await createRsvp(eventId, ada);
    const transport = fakeTransport();
    const result = await runOutboxOnce({ email: emailSender(transport, "RSVP <alex@alexradu.co>") });
    expect(result.sent).toBe(1);
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]).toMatchObject({
      from: "RSVP <alex@alexradu.co>",
      to: "ada@example.com",
      subject: "You're going to Hack Night",
    });
    expect(transport.sent[0].text).toContain("/hack-night");
  });

  it("sends the waitlist email while the person is still waitlisted", async () => {
    const { ada, grace, eventId } = await setup(1);
    await createRsvp(eventId, ada);
    await createRsvp(eventId, grace);
    const transport = fakeTransport();
    await runOutboxOnce({ email: emailSender(transport, "a@b.c") });
    expect(transport.sent.find((m) => m.to === "grace@example.com")?.subject).toBe(
      "You're on the waitlist for Hack Night",
    );
  });

  it("only sends the promotion when they were promoted before the waitlist email went out", async () => {
    const { ada, grace, eventId } = await setup(1);
    await createRsvp(eventId, ada);
    await createRsvp(eventId, grace);
    await cancelRsvp(eventId, ada);
    const transport = fakeTransport();
    await runOutboxOnce({ email: emailSender(transport, "a@b.c") });
    const toGrace = transport.sent.filter((m) => m.to === "grace@example.com").map((m) => m.subject);
    expect(toGrace).toEqual(["A spot opened up: you're going to Hack Night"]);
  });

  it("skips the email when the RSVP was cancelled before sending", async () => {
    const { ada, eventId } = await setup();
    await createRsvp(eventId, ada);
    await cancelRsvp(eventId, ada);
    const transport = fakeTransport();
    const result = await runOutboxOnce({ email: emailSender(transport, "a@b.c") });
    expect(result.sent).toBe(1);
    expect(transport.sent).toHaveLength(0);
  });

  it("skips the email when notifications are off or the event was cancelled", async () => {
    const { ada, grace, eventId } = await setup();
    await createRsvp(eventId, ada);
    await createRsvp(eventId, grace);
    await getPool().query("UPDATE rsvps SET notifications_enabled = false WHERE user_id = $1", [ada]);
    await getPool().query("UPDATE events SET cancelled_at = now() WHERE id = $1", [eventId]);
    const transport = fakeTransport();
    await runOutboxOnce({ email: emailSender(transport, "a@b.c") });
    expect(transport.sent).toHaveLength(0);
  });

  it("retries when the transport fails", async () => {
    const { ada, eventId } = await setup();
    await createRsvp(eventId, ada);
    const failing = {
      sendMail: async () => {
        throw new Error("535 Authentication Failed");
      },
    };
    const result = await runOutboxOnce({ email: emailSender(failing, "a@b.c") });
    expect(result.retried).toBe(1);
    const { rows } = await getPool().query("SELECT status, last_error FROM outbox");
    expect(rows[0]).toEqual({ status: "pending", last_error: "535 Authentication Failed" });
  });

  it("dead-letters an unknown kind instead of guessing", async () => {
    await getPool().query(
      "INSERT INTO outbox (channel, kind, payload, attempts) VALUES ('email', 'mystery', '{}', 7)",
    );
    const result = await runOutboxOnce({ email: emailSender(fakeTransport(), "a@b.c") });
    expect(result.dead).toBe(1);
  });
});
