import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { tenantContext, requireTenant } from '../middleware/tenant';
import jwt from 'jsonwebtoken';

const router = Router();
router.use(authenticate);
router.use(tenantContext);

// Create attendance record with entries
router.post('/records', requireRole(['ADMIN', 'CLERK', 'PASTOR']), requireTenant, async (req, res) => {
  const { date, serviceType, departmentId, entries } = req.body as { date: string; serviceType?: string; departmentId?: number; entries: { memberId?: number; eventId?: number; present?: boolean; demographicGroup?: 'AMM'|'AWM'|'YOUTHS'|'AMBASSADORS'|'CHILDREN' }[] };

  // Build data payload compatible with Prisma relation typing
  const data: any = {
    date: new Date(date),
    serviceType,
    entries: { create: (Array.isArray(entries) ? entries : []).map(e => ({ memberId: e.memberId, eventId: e.eventId, present: e.present ?? true })) },
  };
  if (typeof departmentId === 'number') {
    // Prefer relation connect to avoid schema/type drift
    data.department = { connect: { id: departmentId } };
  }

  // If demographicGroup provided per entry, persist it on the member profile
  const allowed: Array<'AMM'|'AWM'|'YOUTHS'|'AMBASSADORS'|'CHILDREN'> = ['AMM','AWM','YOUTHS','AMBASSADORS','CHILDREN'];
  try {
    await prisma.$transaction(async (tx) => {
      const tid = (req as any).tenantId as number;
      // Update member demographics first
      for (const e of (entries || [])) {
        if (e.memberId && e.demographicGroup && allowed.includes(e.demographicGroup)) {
          await tx.member.update({ where: { id: Number(e.memberId) }, data: { demographicGroup: e.demographicGroup, tenantId: tid } });
        }
      }
      // Then create the attendance record
      const record = await tx.attendanceRecord.create({
        data: { ...data, tenantId: tid },
        include: { entries: true },
      });
      res.status(201).json(record);
    });
  } catch (e: any) {
    return res.status(500).json({ message: 'Failed to create attendance record', error: String(e) });
  }
});

router.get('/records', requireRole(['ADMIN', 'CLERK', 'PASTOR']), requireTenant, async (req, res) => {
  const { serviceType, departmentId, from, to } = req.query as { serviceType?: string; departmentId?: string; from?: string; to?: string };
  const where: any = {};
  if (serviceType) where.serviceType = serviceType;
  if (departmentId) where.departmentId = Number(departmentId);
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(from);
    if (to) {
      const end = new Date(to);
      // Include whole day by setting end to 23:59:59 local
      end.setHours(23, 59, 59, 999);
      where.date.lte = end;
    }
  }
  const tid = (req as any).tenantId as number;
  where.tenantId = tid;
  const records = await prisma.attendanceRecord.findMany({
    where,
    include: { entries: true },
    orderBy: { date: 'desc' },
  });
  res.json(records);
});

// Simple summary: attendance count per department per month
router.get('/summary/monthly', requireRole(['ADMIN', 'CLERK', 'PASTOR']), requireTenant, async (req, res) => {
  const tid = (req as any).tenantId as number;
  const records = await prisma.attendanceRecord.findMany({ where: { tenantId: tid }, include: { entries: true } });
  const map = new Map<string, number>();
  (records as any[]).forEach((r: any) => {
    const key = `${r.departmentId || 'all'}-${r.date.getFullYear()}-${r.date.getMonth() + 1}`;
    const count = (r.entries as any[]).filter((e: any) => e.present).length;
    map.set(key, (map.get(key) || 0) + count);
  });
  const summary = Array.from(map.entries()).map(([key, total]) => {
    const [departmentId, y, m] = key.split('-');
    return { departmentId: departmentId === 'all' ? null : Number(departmentId), year: Number(y), month: Number(m), total };
  });
  res.json(summary);
});

// QR-based communion attendance: scan token to mark present
router.post('/communion/scan', requireRole(['ADMIN', 'CLERK', 'PASTOR']), requireTenant, async (req, res) => {
  const { token } = req.body as { token: string };
  if (!token) return res.status(400).json({ message: 'token required' });
  try {
    const secret = process.env.QR_SECRET || process.env.JWT_SECRET || 'changeme-super-secret-key';
    const payload = jwt.verify(token, secret) as { memberId: number };
    const memberId = Number(payload.memberId);
    const today = new Date();
    const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const dayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    // Ensure an event labeled Holy Communion exists for today (optional)
    const tid = (req as any).tenantId as number;
    let event = await prisma.event.findFirst({ where: { title: 'Holy Communion', date: { gte: dayStart, lte: dayEnd }, tenantId: tid } });
    if (!event) {
      event = await prisma.event.create({ data: { title: 'Holy Communion', description: 'Communion service', date: today, tenantId: tid } });
    }

    // Ensure attendance record exists for today with serviceType HOLY_COMMUNION
    let record = await prisma.attendanceRecord.findFirst({ where: { date: { gte: dayStart, lte: dayEnd }, serviceType: 'HOLY_COMMUNION', tenantId: tid }, include: { entries: true } });
    if (!record) {
      record = await prisma.attendanceRecord.create({ data: { date: today, serviceType: 'HOLY_COMMUNION', tenantId: tid }, include: { entries: true } });
    }
    if (!record) return res.status(500).json({ message: 'Failed to create attendance record' });

    // Check if already present
    const existing = await prisma.attendanceEntry.findFirst({ where: { attendanceRecordId: record.id, memberId, tenantId: tid } });
    if (existing) {
      if (!existing.present) {
        await prisma.attendanceEntry.update({ where: { id: existing.id }, data: { present: true, eventId: event?.id, tenantId: tid } });
      }
      return res.json({ status: 'already_marked', recordId: record.id, eventId: event?.id });
    }

    await prisma.attendanceEntry.create({ data: { attendanceRecordId: record.id, memberId, present: true, eventId: event?.id, tenantId: tid } });
    res.status(201).json({ status: 'marked_present', recordId: record.id, eventId: event?.id });
  } catch (e: any) {
    res.status(400).json({ message: 'Invalid or expired token', error: String(e) });
  }
});

export default router;
