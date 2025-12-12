"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../config/prisma");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
// List ministries
router.get('/', async (_req, res) => {
    const list = await prisma_1.prisma.ministry.findMany({ orderBy: { name: 'asc' } });
    res.json(list);
});
// Get ministry details
router.get('/:id', async (req, res) => {
    const id = Number(req.params.id);
    const min = await prisma_1.prisma.ministry.findUnique({
        where: { id },
        include: {
            leader: true,
            members: true,
            events: true,
        },
    });
    if (!min)
        return res.status(404).json({ message: 'Ministry not found' });
    res.json(min);
});
// Create Department
router.post('/', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), async (req, res) => {
    const { name, description, leaderId } = req.body;
    const min = await prisma_1.prisma.ministry.create({ data: { name, description, leaderId } });
    res.status(201).json(min);
});
// Update ministry
router.put('/:id', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), async (req, res) => {
    const id = Number(req.params.id);
    const { name, description, leaderId } = req.body;
    const updated = await prisma_1.prisma.ministry.update({ where: { id }, data: { name, description, leaderId } });
    res.json(updated);
});
// Delete ministry
router.delete('/:id', (0, auth_1.requireRole)(['ADMIN', 'CLERK']), async (req, res) => {
    const id = Number(req.params.id);
    await prisma_1.prisma.ministry.delete({ where: { id } });
    res.status(204).end();
});
// Assign/Change leader by userId
router.post('/:id/assign-leader', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), async (req, res) => {
    const id = Number(req.params.id);
    const { leaderId } = req.body;
    const updated = await prisma_1.prisma.ministry.update({ where: { id }, data: { leaderId } });
    res.json(updated);
});
// Assign leader by memberId (uses member.userId)
router.post('/:id/assign-leader-member', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), async (req, res) => {
    const id = Number(req.params.id);
    const { memberId } = req.body;
    if (!memberId)
        return res.status(400).json({ message: 'memberId is required' });
    const member = await prisma_1.prisma.member.findUnique({ where: { id: memberId } });
    if (!member)
        return res.status(404).json({ message: 'Member not found' });
    if (!member.userId)
        return res.status(400).json({ message: 'Selected member has no linked user account' });
    const updated = await prisma_1.prisma.ministry.update({ where: { id }, data: { leaderId: member.userId } });
    res.json(updated);
});
// Add member to ministry (set member.ministryId)
router.post('/:id/members/:memberId', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), async (req, res) => {
    const id = Number(req.params.id);
    const memberId = Number(req.params.memberId);
    const updated = await prisma_1.prisma.member.update({ where: { id: memberId }, data: { ministryId: id } });
    res.status(200).json(updated);
});
// Remove member from ministry (set member.ministryId = null)
router.delete('/:id/members/:memberId', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), async (req, res) => {
    const memberId = Number(req.params.memberId);
    const updated = await prisma_1.prisma.member.update({ where: { id: memberId }, data: { ministryId: null } });
    res.status(200).json(updated);
});
// Multi-membership: list members via join table
router.get('/:id/memberships', async (req, res) => {
    const id = Number(req.params.id);
    try {
        const members = await prisma_1.prisma.$queryRaw `SELECT m.* FROM MemberMinistry mm JOIN Member m ON m.id = mm.memberId WHERE mm.ministryId = ${id} ORDER BY m.lastName ASC, m.firstName ASC`;
        res.json(members);
    }
    catch (e) {
        res.status(500).json({ message: 'Failed to load memberships', error: String(e) });
    }
});
// Multi-membership: add link (idempotent)
router.post('/:id/memberships', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), async (req, res) => {
    const id = Number(req.params.id);
    const { memberId, role } = req.body;
    if (!memberId)
        return res.status(400).json({ message: 'memberId is required' });
    try {
        await prisma_1.prisma.$executeRawUnsafe('INSERT OR IGNORE INTO MemberMinistry (memberId, ministryId, role, joinedAt) VALUES (?, ?, ?, CURRENT_TIMESTAMP)', memberId, id, role || null);
        res.status(201).json({ memberId, ministryId: id });
    }
    catch (e) {
        res.status(500).json({ message: 'Failed to add membership', error: String(e) });
    }
});
// Multi-membership: remove link
router.delete('/:id/memberships/:memberId', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), async (req, res) => {
    const id = Number(req.params.id);
    const memberId = Number(req.params.memberId);
    try {
        await prisma_1.prisma.$executeRawUnsafe('DELETE FROM MemberMinistry WHERE memberId = ? AND ministryId = ?', memberId, id);
        res.status(200).json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ message: 'Failed to remove membership', error: String(e) });
    }
});
// List ministry meetings (events with ministryId)
router.get('/:id/meetings', async (req, res) => {
    const id = Number(req.params.id);
    const events = await prisma_1.prisma.event.findMany({ where: { ministryId: id }, orderBy: { date: 'asc' } });
    res.json(events);
});
// Schedule a ministry meeting (create event)
router.post('/:id/meetings', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), async (req, res) => {
    const id = Number(req.params.id);
    const { title, description, date, location } = req.body;
    const ev = await prisma_1.prisma.event.create({ data: { title, description, date: new Date(date), location, ministryId: id } });
    res.status(201).json(ev);
});
// Ministry report: members count, upcoming meetings count, attendance summary per month
router.get('/:id/report', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), async (req, res) => {
    const id = Number(req.params.id);
    const [membersCount, upcomingMeetings, records] = await Promise.all([
        prisma_1.prisma.member.count({ where: { ministryId: id } }),
        prisma_1.prisma.event.count({ where: { ministryId: id, date: { gte: new Date() } } }),
        prisma_1.prisma.attendanceRecord.findMany({ where: { ministryId: id }, include: { entries: true } }),
    ]);
    const map = new Map();
    records.forEach(r => {
        const key = `${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2, '0')}`;
        const present = r.entries.filter(e => e.present).length;
        map.set(key, (map.get(key) || 0) + present);
    });
    const attendanceMonthly = Array.from(map.entries()).map(([month, total]) => ({ month, total }));
    res.json({ membersCount, upcomingMeetings, attendanceMonthly });
});
exports.default = router;
