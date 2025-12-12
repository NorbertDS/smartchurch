"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../config/prisma");
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.use(tenant_1.tenantContext);
const ALLOWED_TYPES = ['TITHE', 'OFFERING', 'DONATION', 'PLEDGE', 'EXPENSE'];
router.post('/records', (0, auth_1.requireRole)(['ADMIN', 'CLERK']), tenant_1.requireTenant, async (req, res) => {
    const { amount, type, description, date, memberId, category } = req.body;
    if (!amount || Number(amount) <= 0)
        return res.status(400).json({ message: 'Amount must be > 0' });
    let t = (type || '').toUpperCase();
    if (t === 'INCOME')
        t = 'DONATION'; // backward-compat with old UI
    if (!ALLOWED_TYPES.includes(t))
        return res.status(400).json({ message: `Invalid type. Use one of ${ALLOWED_TYPES.join(', ')}` });
    const tid = req.tenantId;
    const rec = await prisma_1.prisma.financeRecord.create({
        data: {
            amount: Number(amount),
            type: t,
            description,
            date: date ? new Date(date) : new Date(),
            memberId: memberId ? Number(memberId) : undefined,
            category,
            tenantId: tid,
        }
    });
    res.status(201).json(rec);
});
router.get('/records', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const { type, from, to } = req.query;
    const where = {};
    if (type) {
        const t = type.toUpperCase();
        if (!ALLOWED_TYPES.includes(t))
            return res.status(400).json({ message: 'Invalid type filter' });
        where.type = t;
    }
    if (from || to) {
        where.date = {};
        if (from)
            where.date.gte = new Date(from);
        if (to) {
            const d = new Date(to);
            d.setHours(23, 59, 59, 999);
            where.date.lte = d;
        }
    }
    const tid = req.tenantId;
    where.tenantId = tid;
    const records = await prisma_1.prisma.financeRecord.findMany({ where, orderBy: { date: 'desc' } });
    res.json(records);
});
// Personal contributions for logged-in member
router.get('/my', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR', 'MEMBER']), tenant_1.requireTenant, async (req, res) => {
    const user = req.user;
    if (!user)
        return res.status(401).json({ message: 'Unauthenticated' });
    const tid = req.tenantId;
    const member = await prisma_1.prisma.member.findFirst({ where: { userId: user.id, tenantId: tid } });
    if (!member)
        return res.status(404).json({ message: 'No linked member profile' });
    const records = await prisma_1.prisma.financeRecord.findMany({ where: { memberId: member.id }, orderBy: { date: 'desc' } });
    res.json(records);
});
router.get('/summary/monthly', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const { from, to } = req.query;
    const where = {};
    if (from || to) {
        where.date = {};
        if (from)
            where.date.gte = new Date(from);
        if (to) {
            const d = new Date(to);
            d.setHours(23, 59, 59, 999);
            where.date.lte = d;
        }
    }
    const tid = req.tenantId;
    where.tenantId = tid;
    const records = await prisma_1.prisma.financeRecord.findMany({ where });
    const mapIncome = new Map();
    const mapExpense = new Map();
    records.forEach(r => {
        const key = `${r.date.getFullYear()}-${r.date.getMonth() + 1}`;
        const isExpense = r.type === 'EXPENSE';
        const target = isExpense ? mapExpense : mapIncome;
        target.set(key, (target.get(key) || 0) + r.amount);
    });
    const months = new Set([...mapIncome.keys(), ...mapExpense.keys()]);
    const summary = Array.from(months.values()).map(m => ({
        year: Number(m.split('-')[0]),
        month: Number(m.split('-')[1]),
        income: mapIncome.get(m) || 0,
        expense: mapExpense.get(m) || 0,
        net: (mapIncome.get(m) || 0) - (mapExpense.get(m) || 0),
    })).sort((a, b) => a.year === b.year ? a.month - b.month : a.year - b.year);
    res.json(summary);
});
router.get('/summary/by-type', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const { from, to } = req.query;
    const where = {};
    if (from || to) {
        where.date = {};
        if (from)
            where.date.gte = new Date(from);
        if (to) {
            const d = new Date(to);
            d.setHours(23, 59, 59, 999);
            where.date.lte = d;
        }
    }
    const tid = req.tenantId;
    where.tenantId = tid;
    const records = await prisma_1.prisma.financeRecord.findMany({ where });
    const totals = { TITHE: 0, OFFERING: 0, DONATION: 0, PLEDGE: 0, EXPENSE: 0 };
    records.forEach(r => { totals[r.type] = (totals[r.type] || 0) + r.amount; });
    res.json(totals);
});
router.get('/summary/expense-category', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const { from, to } = req.query;
    const where = { type: 'EXPENSE' };
    if (from || to) {
        where.date = {};
        if (from)
            where.date.gte = new Date(from);
        if (to) {
            const d = new Date(to);
            d.setHours(23, 59, 59, 999);
            where.date.lte = d;
        }
    }
    const tid = req.tenantId;
    where.tenantId = tid;
    const records = await prisma_1.prisma.financeRecord.findMany({ where });
    const totals = {};
    records.forEach(r => {
        const key = r.category || 'Uncategorized';
        totals[key] = (totals[key] || 0) + r.amount;
    });
    res.json(totals);
});
exports.default = router;
