"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../config/prisma");
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.use(tenant_1.tenantContext);
// Simple SSE stream for event updates
const clients = [];
function publish(type, payload) {
    const msg = JSON.stringify({ type, payload, ts: new Date().toISOString() });
    clients.forEach(({ res }) => { try {
        res.write(`data: ${msg}\n\n`);
    }
    catch { } });
}
global.eventStreamPublish = publish;
router.get('/stream', async (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
    });
    clients.push({ res });
    res.write(`data: ${JSON.stringify({ type: 'hello', ts: new Date().toISOString() })}\n\n`);
    const keep = setInterval(() => { try {
        res.write(':keepalive\n\n');
    }
    catch { } }, 20000);
    req.on('close', () => {
        clearInterval(keep);
        const idx = clients.findIndex(c => c.res === res);
        if (idx >= 0)
            clients.splice(idx, 1);
    });
});
// List events
router.get('/', tenant_1.requireTenant, async (req, res) => {
    const tid = req.tenantId;
    const events = await prisma_1.prisma.event.findMany({ where: { tenantId: tid }, orderBy: { date: 'asc' } });
    res.json(events);
});
// Create event
router.post('/', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const tid = req.tenantId;
    try {
        const { title, date, description, location, departmentId } = req.body;
        const cleanTitle = String(title || '').trim();
        if (!cleanTitle)
            return res.status(400).json({ message: 'Title is required' });
        if (!date)
            return res.status(400).json({ message: 'Date is required' });
        const parsed = typeof date === 'string' ? new Date(date) : date;
        if (!(parsed instanceof Date) || isNaN(parsed.getTime())) {
            return res.status(400).json({ message: 'Invalid date format. Use ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:mm)' });
        }
        const data = { title: cleanTitle, date: parsed, description: description || undefined, location: location || undefined, tenantId: tid };
        if (typeof departmentId === 'number')
            data.department = { connect: { id: departmentId } };
        const event = await prisma_1.prisma.event.create({ data });
        // Publish SSE update if stream is enabled
        try {
            if (global.eventStreamPublish)
                global.eventStreamPublish('created', { id: event.id, title: event.title, date: event.date, location: event.location });
        }
        catch { }
        return res.status(201).json(event);
    }
    catch (e) {
        const msg = e?.message || 'Failed to create event';
        try {
            console.warn('[Events] create failed:', msg);
        }
        catch { }
        return res.status(500).json({ message: msg });
    }
});
// Update event
router.put('/:id', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const tid = req.tenantId;
    try {
        const { title, date, description, location, departmentId } = req.body;
        const data = {};
        if (typeof title === 'string') {
            const t = title.trim();
            if (!t)
                return res.status(400).json({ message: 'Title cannot be empty' });
            data.title = t;
        }
        if (date) {
            const parsed = typeof date === 'string' ? new Date(date) : date;
            if (!(parsed instanceof Date) || isNaN(parsed.getTime()))
                return res.status(400).json({ message: 'Invalid date format' });
            data.date = parsed;
        }
        if (typeof description === 'string')
            data.description = description || undefined;
        if (typeof location === 'string')
            data.location = location || undefined;
        if (typeof departmentId === 'number')
            data.department = { connect: { id: departmentId } };
        data.tenantId = tid;
        const updated = await prisma_1.prisma.event.update({ where: { id }, data });
        try {
            if (global.eventStreamPublish)
                global.eventStreamPublish('updated', { id: updated.id, title: updated.title, date: updated.date, location: updated.location });
        }
        catch { }
        return res.json(updated);
    }
    catch (e) {
        const msg = e?.message || 'Failed to update event';
        try {
            console.warn('[Events] update failed:', msg);
        }
        catch { }
        return res.status(500).json({ message: msg });
    }
});
// Delete event
router.delete('/:id', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const tid = req.tenantId;
    const ev = await prisma_1.prisma.event.findFirst({ where: { id, tenantId: tid } });
    if (!ev)
        return res.status(404).json({ message: 'Event not found' });
    await prisma_1.prisma.event.delete({ where: { id } });
    try {
        if (global.eventStreamPublish)
            global.eventStreamPublish('deleted', { id, title: ev.title });
    }
    catch { }
    res.status(204).end();
});
// Member registration for event
router.post('/:id/register', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR', 'MEMBER']), tenant_1.requireTenant, async (req, res) => {
    const eventId = Number(req.params.id);
    const { memberId } = req.body;
    const tid = req.tenantId;
    const reg = await prisma_1.prisma.eventRegistration.create({ data: { eventId, memberId, status: 'Registered', tenantId: tid } });
    res.status(201).json(reg);
});
// AI Event Planner — suggest ideal dates for a given month based on attendance
router.post('/plan', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const { month, take = 3, departmentId } = req.body;
    if (!month || !/^[0-9]{4}-[0-9]{2}$/.test(month)) {
        return res.status(400).json({ message: 'month must be YYYY-MM' });
    }
    const [year, mon] = month.split('-').map(Number);
    const start = new Date(year, mon - 1, 1);
    const end = new Date(year, mon, 0);
    // Attendance in the last 6 months prior to target month
    const sixMonthsAgo = new Date(start.getFullYear(), start.getMonth() - 6, 1);
    const tid = req.tenantId;
    const attendance = await prisma_1.prisma.attendanceRecord.findMany({
        where: { date: { gte: sixMonthsAgo, lt: new Date(year, mon, 1) }, tenantId: tid },
        include: { entries: true },
    });
    const dowScores = Array(7).fill(0); // 0=Sun..6=Sat
    attendance.forEach((r) => {
        const dow = r.date.getDay();
        const present = r.entries.filter((e) => e.present).length;
        dowScores[dow] += present || 1; // count-based score, fallback 1
    });
    const existing = await prisma_1.prisma.event.findMany({
        where: { date: { gte: start, lte: end }, tenantId: tid, ...(departmentId ? { departmentId } : {}) },
        orderBy: { date: 'asc' },
    });
    const busy = new Set(existing.map((e) => new Date(e.date).toDateString()));
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const candidates = [];
    for (let d = new Date(start); d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
        const key = d.toDateString();
        if (busy.has(key))
            continue;
        const score = dowScores[d.getDay()];
        if (score <= 0)
            continue;
        const reason = `High attendance on ${dayName[d.getDay()]} (score ${score}). No conflicts.`;
        candidates.push({ date: new Date(d), score, reason });
    }
    candidates.sort((a, b) => b.score - a.score || a.date.getTime() - b.date.getTime());
    const suggestions = candidates.slice(0, Math.max(1, Math.min(10, take))).map((c) => ({
        date: c.date.toISOString(),
        score: c.score,
        reason: c.reason,
    }));
    res.json({ month, suggestions, existing });
});
exports.default = router;
