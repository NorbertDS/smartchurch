"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../config/prisma");
const auth_1 = require("../middleware/auth");
const sms_1 = require("../services/sms");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
// POST /sms/send
// Body: { message: string; audience?: 'ALL'|'MEMBER_IDS'; ids?: number[] }
router.post('/send', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), async (req, res) => {
    const { message, audience, ids } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ message: 'Message is required' });
    }
    let numbers = [];
    try {
        if (audience === 'MEMBER_IDS' && Array.isArray(ids) && ids.length > 0) {
            const members = await prisma_1.prisma.member.findMany({ where: { id: { in: ids }, deletedAt: null } });
            numbers = members.map(m => m.contact || '').filter(Boolean);
        }
        else {
            const members = await prisma_1.prisma.member.findMany({ where: { deletedAt: null } });
            numbers = members.map(m => m.contact || '').filter(Boolean);
        }
        if (!numbers.length) {
            return res.status(400).json({ message: 'No valid member contacts found' });
        }
        const result = await (0, sms_1.sendBulkSms)(numbers, message.trim());
        // Audit log entry for traceability
        try {
            await prisma_1.prisma.auditLog.create({ data: { userId: req.user.id, action: `SMS_SENT:${result.sent}/${result.failed}`, entityType: 'System' } });
        }
        catch { }
        res.json({ status: 'ok', ...result });
    }
    catch (e) {
        res.status(500).json({ message: 'Failed to send SMS', error: e?.message || String(e) });
    }
});
exports.default = router;
