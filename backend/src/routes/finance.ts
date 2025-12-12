import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { tenantContext, requireTenant } from '../middleware/tenant';

const router = Router();
router.use(authenticate);
router.use(tenantContext);

const ALLOWED_TYPES = ['TITHE', 'OFFERING', 'DONATION', 'PLEDGE', 'EXPENSE'] as const;

type FinanceType = typeof ALLOWED_TYPES[number];

router.post('/records', requireRole(['ADMIN', 'CLERK']), requireTenant, async (req, res) => {
  const { amount, type, description, date, memberId, category } = req.body as {
    amount: number; type: string; description?: string; date?: string | Date; memberId?: number; category?: string;
  };
  if (!amount || Number(amount) <= 0) return res.status(400).json({ message: 'Amount must be > 0' });
  let t = (type || '').toUpperCase();
  if (t === 'INCOME') t = 'DONATION'; // backward-compat with old UI
  if (!ALLOWED_TYPES.includes(t as FinanceType)) return res.status(400).json({ message: `Invalid type. Use one of ${ALLOWED_TYPES.join(', ')}` });

  const tid = (req as any).tenantId as number;
  const rec = await prisma.financeRecord.create({
    data: {
      amount: Number(amount),
      type: t as any,
      description,
      date: date ? new Date(date) : new Date(),
      memberId: memberId ? Number(memberId) : undefined,
      category,
      tenantId: tid,
    }
  });
  res.status(201).json(rec);
});

router.get('/records', requireRole(['ADMIN', 'CLERK', 'PASTOR']), requireTenant, async (req, res) => {
  const { type, from, to } = req.query as { type?: string; from?: string; to?: string };
  const where: any = {};
  if (type) {
    const t = type.toUpperCase();
    if (!ALLOWED_TYPES.includes(t as FinanceType)) return res.status(400).json({ message: 'Invalid type filter' });
    where.type = t;
  }
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(from);
    if (to) { const d = new Date(to); d.setHours(23,59,59,999); where.date.lte = d; }
  }
  const tid = (req as any).tenantId as number;
  where.tenantId = tid;
  const records = await prisma.financeRecord.findMany({ where, orderBy: { date: 'desc' } });
  res.json(records);
});

// Personal contributions for logged-in member
router.get('/my', requireRole(['ADMIN', 'CLERK', 'PASTOR', 'MEMBER']), requireTenant, async (req, res) => {
  const user = (req as any).user;
  if (!user) return res.status(401).json({ message: 'Unauthenticated' });
  const tid = (req as any).tenantId as number;
  const member = await prisma.member.findFirst({ where: { userId: user.id, tenantId: tid } });
  if (!member) return res.status(404).json({ message: 'No linked member profile' });
  const records = await prisma.financeRecord.findMany({ where: { memberId: member.id }, orderBy: { date: 'desc' } });
  res.json(records);
});

router.get('/summary/monthly', requireRole(['ADMIN', 'CLERK', 'PASTOR']), requireTenant, async (req, res) => {
  const { from, to } = req.query as { from?: string; to?: string };
  const where: any = {};
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(from);
    if (to) { const d = new Date(to); d.setHours(23,59,59,999); where.date.lte = d; }
  }
  const tid = (req as any).tenantId as number;
  where.tenantId = tid;
  const records = await prisma.financeRecord.findMany({ where });
  const mapIncome = new Map<string, number>();
  const mapExpense = new Map<string, number>();
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
  })).sort((a,b)=> a.year === b.year ? a.month - b.month : a.year - b.year);
  res.json(summary);
});

router.get('/summary/by-type', requireRole(['ADMIN', 'CLERK', 'PASTOR']), requireTenant, async (req, res) => {
  const { from, to } = req.query as { from?: string; to?: string };
  const where: any = {};
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(from);
    if (to) { const d = new Date(to); d.setHours(23,59,59,999); where.date.lte = d; }
  }
  const tid = (req as any).tenantId as number;
  where.tenantId = tid;
  const records = await prisma.financeRecord.findMany({ where });
  const totals: Record<string, number> = { TITHE: 0, OFFERING: 0, DONATION: 0, PLEDGE: 0, EXPENSE: 0 };
  records.forEach(r => { totals[r.type] = (totals[r.type] || 0) + r.amount; });
  res.json(totals);
});

router.get('/summary/expense-category', requireRole(['ADMIN', 'CLERK', 'PASTOR']), requireTenant, async (req, res) => {
  const { from, to } = req.query as { from?: string; to?: string };
  const where: any = { type: 'EXPENSE' };
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(from);
    if (to) { const d = new Date(to); d.setHours(23,59,59,999); where.date.lte = d; }
  }
  const tid = (req as any).tenantId as number;
  where.tenantId = tid;
  const records = await prisma.financeRecord.findMany({ where });
  const totals: Record<string, number> = {};
  records.forEach(r => {
    const key = r.category || 'Uncategorized';
    totals[key] = (totals[key] || 0) + r.amount;
  });
  res.json(totals);
});

export default router;
