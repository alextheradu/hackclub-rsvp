export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.DATABASE_URL) return;
  const { startOutboxWorker } = await import("@/lib/outbox-worker");
  const { createSmtpTransport, smtpConfigured } = await import("@/lib/mail");
  const { emailSender } = await import("@/lib/email-sender");

  if (!smtpConfigured()) console.warn("outbox: SMTP not configured, emails will wait in the queue");
  startOutboxWorker({
    email: smtpConfigured() ? emailSender(createSmtpTransport(), process.env.MAIL_FROM!) : undefined,
  });
}
