"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = sendEmail;
const nodemailer_1 = __importDefault(require("nodemailer"));
function getSmtpTransport() {
    const host = String(process.env.SMTP_HOST || '').trim();
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
    const user = String(process.env.SMTP_USER || '').trim();
    const pass = String(process.env.SMTP_PASS || '');
    if (!host)
        return null;
    const auth = user ? { user, pass } : undefined;
    return nodemailer_1.default.createTransport({ host, port, secure, auth });
}
async function sendEmail(payload) {
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
