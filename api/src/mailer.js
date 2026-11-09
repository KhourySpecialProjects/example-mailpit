import nodemailer from 'nodemailer';

const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;

// Everything comes from env vars, so pointing at a real provider needs no code change.
// SMTP_SECURE=true means implicit TLS (usually port 465); with false, Nodemailer
// still upgrades via STARTTLS when the server offers it (usually port 587).
const transport = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT),
  secure: SMTP_SECURE === 'true',
  auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
});

export function sendMail({ to, subject, text, html }) {
  return transport.sendMail({ from: MAIL_FROM, to, subject, text, html });
}
