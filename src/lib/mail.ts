import nodemailer from "nodemailer";

export type Mail = { to: string; subject: string; text: string; html: string };

export type MailTransport = {
  sendMail(mail: Mail & { from: string }): Promise<unknown>;
};

export function smtpConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && env.MAIL_FROM);
}

export function createSmtpTransport(env: NodeJS.ProcessEnv = process.env): MailTransport {
  const port = Number(env.SMTP_PORT || 465);
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
}
