"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../config/prisma");
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.use(tenant_1.tenantContext);
// List departments
router.get('/', tenant_1.requireTenant, async (req, res) => {
    const tid = req.tenantId;
    const list = await prisma_1.prisma.department.findMany({ where: { tenantId: tid }, orderBy: { name: 'asc' } });
    res.json(list);
});
// Get department details
router.get('/:id', tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const tid = req.tenantId;
    const dep = await prisma_1.prisma.department.findFirst({
        where: { id, tenantId: tid },
        include: {
            leader: true,
            members: true,
            events: true,
        },
    });
    if (!dep)
        return res.status(404).json({ message: 'Department not found' });
    res.json(dep);
});
// Create department
router.post('/', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const { name, description, leaderId } = req.body;
    const tid = req.tenantId;
    const dep = await prisma_1.prisma.department.create({ data: { name, description, leaderId, tenantId: tid } });
    res.status(201).json(dep);
});
// Update department
router.put('/:id', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const tid = req.tenantId;
    const { name, description, leaderId } = req.body;
    const updated = await prisma_1.prisma.department.update({ where: { id }, data: { name, description, leaderId, tenantId: tid } });
    res.json(updated);
});
// Delete department
router.delete('/:id', (0, auth_1.requireRole)(['ADMIN', 'CLERK']), tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const tid = req.tenantId;
    const dep = await prisma_1.prisma.department.findFirst({ where: { id, tenantId: tid } });
    if (!dep)
        return res.status(404).json({ message: 'Department not found' });
    await prisma_1.prisma.department.delete({ where: { id } });
    res.status(204).end();
});
// Assign/Change leader by userId
router.post('/:id/assign-leader', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const tid = req.tenantId;
    const { leaderId } = req.body;
    const updated = await prisma_1.prisma.department.update({ where: { id }, data: { leaderId, tenantId: tid } });
    res.json(updated);
});
// Assign leader by memberId (uses member.userId)
router.post('/:id/assign-leader-member', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const { memberId } = req.body;
    if (!memberId)
        return res.status(400).json({ message: 'memberId is required' });
    const tid = req.tenantId;
    const member = await prisma_1.prisma.member.findFirst({ where: { id: memberId, tenantId: tid } });
    if (!member)
        return res.status(404).json({ message: 'Member not found' });
    if (!member.userId)
        return res.status(400).json({ message: 'Selected member has no linked user account' });
    const updated = await prisma_1.prisma.department.update({ where: { id }, data: { leaderId: member.userId, tenantId: tid } });
    res.json(updated);
});
// Add member to department (set member.departmentId)
router.post('/:id/members/:memberId', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const memberId = Number(req.params.memberId);
    const tid = req.tenantId;
    const updated = await prisma_1.prisma.member.update({ where: { id: memberId }, data: { departmentId: id, tenantId: tid } });
    res.status(200).json(updated);
});
// Remove member from department (set member.departmentId = null)
router.delete('/:id/members/:memberId', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const memberId = Number(req.params.memberId);
    const tid = req.tenantId;
    const updated = await prisma_1.prisma.member.update({ where: { id: memberId }, data: { departmentId: null, tenantId: tid } });
    res.status(200).json(updated);
});
// Self-join department (member joins themselves without staff restriction)
router.post('/:id/join', tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const user = req.user;
    if (!user)
        return res.status(401).json({ message: 'Unauthenticated' });
    const tid = req.tenantId;
    const member = await prisma_1.prisma.member.findFirst({ where: { userId: user.id, tenantId: tid } });
    if (!member)
        return res.status(404).json({ message: 'No linked member profile' });
    const updated = await prisma_1.prisma.member.update({ where: { id: member.id }, data: { departmentId: id, tenantId: tid } });
    res.status(200).json(updated);
});
// Multi-membership: list members via join table
router.get('/:id/memberships', tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    try {
        const tid = req.tenantId;
        const members = await prisma_1.prisma.$queryRaw `SELECT m.* FROM MemberDepartment md JOIN Member m ON m.id = md.memberId WHERE md.departmentId = ${id} AND m.tenantId = ${tid} ORDER BY m.lastName ASC, m.firstName ASC`;
        res.json(members);
    }
    catch (e) {
        res.status(500).json({ message: 'Failed to load memberships', error: String(e) });
    }
});
// Multi-membership: add link (idempotent)
router.post('/:id/memberships', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const { memberId, role } = req.body;
    if (!memberId)
        return res.status(400).json({ message: 'memberId is required' });
    try {
        await prisma_1.prisma.$executeRawUnsafe('INSERT OR IGNORE INTO MemberDepartment (memberId, departmentId, role, joinedAt) VALUES (?, ?, ?, CURRENT_TIMESTAMP)', memberId, id, role || null);
        res.status(201).json({ memberId, departmentId: id });
    }
    catch (e) {
        res.status(500).json({ message: 'Failed to add membership', error: String(e) });
    }
});
// Multi-membership: remove link
router.delete('/:id/memberships/:memberId', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const memberId = Number(req.params.memberId);
    try {
        await prisma_1.prisma.$executeRawUnsafe('DELETE FROM MemberDepartment WHERE memberId = ? AND departmentId = ?', memberId, id);
        res.status(200).json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ message: 'Failed to remove membership', error: String(e) });
    }
});
// List department meetings (events with departmentId)
router.get('/:id/meetings', tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const tid = req.tenantId;
    const events = await prisma_1.prisma.event.findMany({ where: { departmentId: id, tenantId: tid }, orderBy: { date: 'asc' } });
    res.json(events);
});
// Schedule a department meeting (create event)
router.post('/:id/meetings', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const { title, description, date, location } = req.body;
    const tid = req.tenantId;
    const ev = await prisma_1.prisma.event.create({ data: { title, description, date: new Date(date), location, departmentId: id, tenantId: tid } });
    res.status(201).json(ev);
});
// Department report: members count, upcoming meetings count, attendance summary per month
router.get('/:id/report', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const tid = req.tenantId;
    const [membersCount, upcomingMeetings, records] = await Promise.all([
        prisma_1.prisma.member.count({ where: { departmentId: id, tenantId: tid } }),
        prisma_1.prisma.event.count({ where: { departmentId: id, tenantId: tid, date: { gte: new Date() } } }),
        prisma_1.prisma.attendanceRecord.findMany({ where: { departmentId: id, tenantId: tid }, include: { entries: true } }),
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
