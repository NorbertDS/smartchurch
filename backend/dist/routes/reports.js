"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../config/prisma");
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.use(tenant_1.tenantContext);
router.get('/dashboard', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const tid = req.tenantId;
    const memberWhere = { tenantId: tid, deletedAt: null, NOT: { membershipStatus: 'PENDING' } };
    const [membersCount, eventsUpcoming, financeMonthly, demographicSummary] = await Promise.all([
        prisma_1.prisma.member.count({ where: memberWhere }),
        prisma_1.prisma.event.count({ where: { date: { gte: new Date() }, tenantId: tid } }),
        prisma_1.prisma.financeRecord.findMany({ where: { tenantId: tid } }),
        prisma_1.prisma.member.groupBy({ by: ['demographicGroup'], where: memberWhere, _count: { _all: true } }),
    ]);
    const monthKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}`;
    const financeMap = new Map();
    financeMonthly.forEach(r => {
        const key = monthKey(r.date);
        if (!financeMap.has(key))
            financeMap.set(key, { income: 0, expense: 0 });
        const obj = financeMap.get(key);
        if (r.type === 'EXPENSE')
            obj.expense += r.amount;
        else
            obj.income += r.amount;
    });
    res.json({
        membersCount,
        eventsUpcoming,
        financeSummary: Array.from(financeMap.entries()).map(([k, v]) => ({ month: k, ...v })),
        demographicCounts: demographicSummary.map(d => ({ group: d.demographicGroup, count: d._count._all })),
    });
});
// Attendance by demographic group (last 30 days)
router.get('/demographics-attendance', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const tid = req.tenantId;
    const entries = await prisma_1.prisma.attendanceEntry.findMany({
        where: { present: true, memberId: { not: null }, tenantId: tid },
        include: { member: true, attendanceRecord: true },
    });
    const filtered = entries.filter(e => e.attendanceRecord?.date && e.attendanceRecord.date >= since);
    const counts = new Map();
    filtered.forEach(e => {
        const grp = e.member?.demographicGroup || 'Unknown';
        counts.set(grp, (counts.get(grp) || 0) + 1);
    });
    res.json(Array.from(counts.entries()).map(([group, count]) => ({ group, count })));
});
// Centralized approved reports corner (read-only for staff)
router.get('/corner', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const tid = req.tenantId;
    const [board, business] = await Promise.all([
        prisma_1.prisma.boardMinute.findMany({ where: { approved: true, tenantId: tid }, orderBy: { meetingDate: 'desc' } }),
        prisma_1.prisma.businessMinute.findMany({ where: { approved: true, tenantId: tid }, orderBy: { meetingDate: 'desc' } }),
    ]);
    const items = [
        ...board.map(b => ({
            type: 'BOARD', id: b.id, title: b.title, meetingDate: b.meetingDate, version: b.version, filePath: b.filePath,
        })),
        ...business.map(b => ({
            type: 'BUSINESS', id: b.id, title: b.title, meetingDate: b.meetingDate, version: b.version, filePath: b.filePath,
        })),
    ];
    res.json(items);
});
exports.default = router;
