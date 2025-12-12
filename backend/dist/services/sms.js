"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSmsProvider = getSmsProvider;
exports.sendBulkSms = sendBulkSms;
exports.normalizePhone = normalizePhone;
require("dotenv/config");
class ConsoleSmsProvider {
    async send(to, message) {
        // Dev-only provider prints to console
        try {
            console.log(`[SMS][DEV] -> ${to}: ${message}`);
            return { to, success: true };
        }
        catch (e) {
            return { to, success: false, error: e?.message || String(e) };
        }
    }
}
class TwilioSmsProvider {
    constructor(accountSid, authToken, fromNumber) {
        // Lazy import to avoid dependency if not used
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const twilio = require('twilio');
        this.client = twilio(accountSid, authToken);
        this.from = fromNumber;
    }
    async send(to, message) {
        try {
            const resp = await this.client.messages.create({
                body: message,
                from: this.from,
                to,
            });
            return { to, success: true };
        }
        catch (e) {
            return { to, success: false, error: e?.message || String(e) };
        }
    }
}
function getSmsProvider() {
    const provider = (process.env.SMS_PROVIDER || 'console').toLowerCase();
    if (provider === 'twilio') {
        const sid = process.env.TWILIO_ACCOUNT_SID || '';
        const tok = process.env.TWILIO_AUTH_TOKEN || '';
        const from = process.env.TWILIO_FROM_NUMBER || '';
        if (!sid || !tok || !from) {
            console.warn('[SMS] Twilio selected but credentials missing; falling back to console provider');
        }
        else {
            return new TwilioSmsProvider(sid, tok, from);
        }
    }
    return new ConsoleSmsProvider();
}
async function sendBulkSms(numbers, message) {
    const provider = getSmsProvider();
    const results = [];
    for (const raw of numbers) {
        const to = normalizePhone(raw);
        if (!to) {
            results.push({ to: raw, success: false, error: 'Invalid phone number' });
            continue;
        }
        const res = await provider.send(to, message);
        results.push(res);
    }
    const sent = results.filter(r => r.success).length;
    const failed = results.length - sent;
    return { results, sent, failed };
}
function normalizePhone(v) {
    if (!v)
        return null;
    let s = String(v).trim();
    // Remove spaces and hyphens
    s = s.replace(/[\s-]+/g, '');
    // If starts with 0 and env has country code, replace leading 0
    const cc = process.env.SMS_DEFAULT_COUNTRY_CODE || '';
    if (cc && s.startsWith('0'))
        s = cc + s.substring(1);
    // If already starts with +, keep as-is
    if (!s.startsWith('+') && cc)
        s = cc + s;
    return s;
}
