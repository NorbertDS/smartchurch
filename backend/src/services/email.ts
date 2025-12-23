import nodemailer from 'nodemailer';

type EmailPayload = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

function getSmtpTransport() {
  const host = String(process.env.SMTP_HOST || '').trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '');

  if (!host) return null;
  const auth = user ? { user, pass } : undefined;
  return nodemailer.createTransport({ host, port, secure, auth });
}

export async function sendEmail(payload: EmailPayload) {
  const transport = getSmtpTransport();
  if (!transport) {
    console.log('[EMAIL][DEV] Missing SMTP config. Email suppressed.');
    console.log(`[EMAIL][DEV] To: ${payload.to}`);
    console.log(`[EMAIL][DEV] Subject: ${payload.subject}`);
    console.log(`[EMAIL][DEV] Body: ${payload.text}`);
    return;
  }
  const from = String(process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@faithconnect.local');
  await transport.sendMail({
    from,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  });
}

