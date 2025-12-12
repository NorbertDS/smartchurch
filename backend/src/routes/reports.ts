import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { tenantContext, requireTenant } from '../middleware/tenant';

const router = Router();
router.use(authenticate);
router.use(tenantContext);

router.get('/dashboard', requireRole(['ADMIN', 'CLERK', 'PASTOR']), requireTenant, async (req, res) => {
  const tid = (req as any).tenantId as number;
  const [membersCount, eventsUpcoming, financeMonthly, demographicSummary] = await Promise.all([
    prisma.member.count({ where: { tenantId: tid } }),
    prisma.event.count({ where: { date: { gte: new Date() }, tenantId: tid } }),
    prisma.financeRecord.findMany({ where: { tenantId: tid } }),
    prisma.member.groupBy({ by: ['demographicGroup'], where: { tenantId: tid }, _count: { _all: true } }),
  ]);
  const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}`;
  const financeMap = new Map<string, { income: number; expense: number }>();
  financeMonthly.forEach(r => {
    const key = monthKey(r.date);
    if (!financeMap.has(key)) financeMap.set(key, { income: 0, expense: 0 });
    const obj = financeMap.get(key)!;
    if (r.type === 'EXPENSE') obj.expense += r.amount; else obj.income += r.amount;
  });
  res.json({
    membersCount,
    eventsUpcoming,
    financeSummary: Array.from(financeMap.entries()).map(([k, v]) => ({ month: k, ...v })),
    demographicCounts: demographicSummary.map(d => ({ group: d.demographicGroup, count: d._count._all })),
  });
});

// Attendance by demographic group (last 30 days)
router.get('/demographics-attendance', requireRole(['ADMIN','CLERK','PASTOR']), requireTenant, async (req, res) => {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const tid = (req as any).tenantId as number;
  const entries = await prisma.attendanceEntry.findMany({
    where: { present: true, memberId: { not: null }, tenantId: tid },
    include: { member: true, attendanceRecord: true },
  });
  const filtered = entries.filter(e => e.attendanceRecord?.date && e.attendanceRecord.date >= since);
  const counts = new Map<string, number>();
  filtered.forEach(e => {
    const grp = e.member?.demographicGroup || 'Unknown';
    counts.set(grp, (counts.get(grp) || 0) + 1);
  });
  res.json(Array.from(counts.entries()).map(([group, count]) => ({ group, count })));
});

// Centralized approved reports corner (read-only for staff)
router.get('/corner', requireRole(['ADMIN','CLERK','PASTOR']), requireTenant, async (req, res) => {
  const tid = (req as any).tenantId as number;
  const [board, business] = await Promise.all([
    prisma.boardMinute.findMany({ where: { approved: true, tenantId: tid }, orderBy: { meetingDate: 'desc' } }),
    prisma.businessMinute.findMany({ where: { approved: true, tenantId: tid }, orderBy: { meetingDate: 'desc' } }),
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

export default router;
