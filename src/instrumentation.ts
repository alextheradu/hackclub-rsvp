export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.DATABASE_URL) return;
  const { startOutboxWorker } = await import("@/lib/outbox-worker");
  const { createSmtpTransport, smtpConfigured } = await import("@/lib/mail");
  const { emailSender } = await import("@/lib/email-sender");
  const { slackSender } = await import("@/lib/slack-sender");

  if (!smtpConfigured())
    console.warn("outbox: SMTP not configured, emails will wait in the queue");
  if (!process.env.SLACK_BOT_TOKEN)
    console.warn(
      "outbox: SLACK_BOT_TOKEN not configured, Slack messages will wait in the queue",
    );
  try {
    const { inviteExistingUsers } = await import("@/lib/organizer-invite");
    const queued = await inviteExistingUsers();
    if (queued)
      console.log(`slack: queued ${queued} organizer channel invites`);
  } catch (error) {
    console.error(
      "slack: organizer invite backfill failed:",
      error instanceof Error ? error.message : "unknown error",
    );
  }
  startOutboxWorker({
    email: smtpConfigured()
      ? emailSender(createSmtpTransport(), process.env.MAIL_FROM!)
      : undefined,
    slack: process.env.SLACK_BOT_TOKEN ? slackSender() : undefined,
  });
}
