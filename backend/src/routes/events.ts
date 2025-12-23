import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { tenantContext, requireTenant } from '../middleware/tenant';

const router = Router();
router.use(authenticate);
router.use(tenantContext);

// Simple SSE stream for event updates
const clients: Array<{ res: any; tenantId: number }> = [];
function publish(tenantId: number, type: 'created'|'updated'|'deleted', payload: any) {
  const msg = JSON.stringify({ type, payload, ts: new Date().toISOString() });
  clients.forEach(({ res, tenantId: tid }) => {
    if (tid !== tenantId) return;
    try { res.write(`data: ${msg}\n\n`); } catch {}
  });
}
(global as any).eventStreamPublish = publish;

router.get('/stream', requireTenant, async (req, res) => {
  const tid = (req as any).tenantId as number;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  clients.push({ res, tenantId: tid });
  res.write(`data: ${JSON.stringify({ type: 'hello', ts: new Date().toISOString() })}\n\n`);
  const keep = setInterval(() => { try { res.write(':keepalive\n\n'); } catch {} }, 20000);
  req.on('close', () => {
    clearInterval(keep);
    const idx = clients.findIndex(c => c.res === res);
    if (idx >= 0) clients.splice(idx, 1);
  });
});

// List events
router.get('/', requireTenant, async (req, res) => {
  const tid = (req as any).tenantId as number;
  const events = await prisma.event.findMany({ where: { tenantId: tid }, orderBy: { date: 'asc' } });
  res.json(events);
});

// Create event
router.post('/', requireRole(['ADMIN', 'CLERK', 'PASTOR']), requireTenant, async (req, res) => {
  const tid = (req as any).tenantId as number;
  try {
    const { title, date, description, location, departmentId } = req.body as { title?: string; date?: string | Date; description?: string; location?: string; departmentId?: number };
    const cleanTitle = String(title || '').trim();
    if (!cleanTitle) return res.status(400).json({ message: 'Title is required' });
    if (!date) return res.status(400).json({ message: 'Date is required' });
    const parsed = typeof date === 'string' ? new Date(date) : date;
    if (!(parsed instanceof Date) || isNaN(parsed.getTime())) {
      return res.status(400).json({ message: 'Invalid date format. Use ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:mm)' });
    }
    const data: any = { title: cleanTitle, date: parsed, description: description || undefined, location: location || undefined, tenantId: tid };
    if (typeof departmentId === 'number') data.department = { connect: { id: departmentId } };
    const event = await prisma.event.create({ data });
    // Publish SSE update if stream is enabled
    try { if ((global as any).eventStreamPublish) (global as any).eventStreamPublish(tid, 'created', { id: event.id, title: event.title, date: event.date, location: event.location }); } catch {}
    return res.status(201).json(event);
  } catch (e: any) {
    const msg = e?.message || 'Failed to create event';
    try { console.warn('[Events] create failed:', msg); } catch {}
    return res.status(500).json({ message: msg });
  }
});

// Update event
router.put('/:id', requireRole(['ADMIN', 'CLERK', 'PASTOR']), requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const tid = (req as any).tenantId as number;
  try {
    const { title, date, description, location, departmentId } = req.body as { title?: string; date?: string | Date; description?: string; location?: string; departmentId?: number };
    const data: any = {};
    if (typeof title === 'string') {
      const t = title.trim();
      if (!t) return res.status(400).json({ message: 'Title cannot be empty' });
      data.title = t;
    }
    if (date) {
      const parsed = typeof date === 'string' ? new Date(date) : date;
      if (!(parsed instanceof Date) || isNaN(parsed.getTime())) return res.status(400).json({ message: 'Invalid date format' });
      data.date = parsed;
    }
    if (typeof description === 'string') data.description = description || undefined;
    if (typeof location === 'string') data.location = location || undefined;
    if (typeof departmentId === 'number') data.department = { connect: { id: departmentId } };
    data.tenantId = tid;
    const updated = await prisma.event.update({ where: { id }, data });
    try { if ((global as any).eventStreamPublish) (global as any).eventStreamPublish(tid, 'updated', { id: updated.id, title: updated.title, date: updated.date, location: updated.location }); } catch {}
    return res.json(updated);
  } catch (e: any) {
    const msg = e?.message || 'Failed to update event';
    try { console.warn('[Events] update failed:', msg); } catch {}
    return res.status(500).json({ message: msg });
  }
});

// Delete event
router.delete('/:id', requireRole(['ADMIN', 'CLERK', 'PASTOR']), requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const tid = (req as any).tenantId as number;
  const ev = await prisma.event.findFirst({ where: { id, tenantId: tid } });
  if (!ev) return res.status(404).json({ message: 'Event not found' });
  await prisma.event.delete({ where: { id } });
  try { if ((global as any).eventStreamPublish) (global as any).eventStreamPublish(tid, 'deleted', { id, title: ev.title }); } catch {}
  res.status(204).end();
});

// Member registration for event
router.post('/:id/register', requireRole(['ADMIN', 'CLERK', 'PASTOR', 'MEMBER']), requireTenant, async (req, res) => {
  const eventId = Number(req.params.id);
  const { memberId } = req.body as { memberId: number };
  const tid = (req as any).tenantId as number;
  const reg = await prisma.eventRegistration.create({ data: { eventId, memberId, status: 'Registered', tenantId: tid } });
  res.status(201).json(reg);
});

// AI Event Planner — suggest ideal dates for a given month based on attendance
router.post('/plan', requireRole(['ADMIN', 'CLERK', 'PASTOR']), requireTenant, async (req, res) => {
  const { month, take = 3, departmentId } = req.body as { month: string; take?: number; departmentId?: number };
  if (!month || !/^[0-9]{4}-[0-9]{2}$/.test(month)) {
    return res.status(400).json({ message: 'month must be YYYY-MM' });
  }
  const [year, mon] = month.split('-').map(Number);
  const start = new Date(year, mon - 1, 1);
  const end = new Date(year, mon, 0);

  // Attendance in the last 6 months prior to target month
  const sixMonthsAgo = new Date(start.getFullYear(), start.getMonth() - 6, 1);
  const tid = (req as any).tenantId as number;
  const attendance = await prisma.attendanceRecord.findMany({
    where: { date: { gte: sixMonthsAgo, lt: new Date(year, mon, 1) }, tenantId: tid },
    include: { entries: true },
  });

  const dowScores: number[] = Array(7).fill(0); // 0=Sun..6=Sat
  attendance.forEach((r) => {
    const dow = r.date.getDay();
    const present = r.entries.filter((e) => e.present).length;
    dowScores[dow] += present || 1; // count-based score, fallback 1
  });

  const existing = await prisma.event.findMany({
    where: { date: { gte: start, lte: end }, tenantId: tid, ...(departmentId ? { departmentId } : {}) },
    orderBy: { date: 'asc' },
  });
  const busy = new Set(existing.map((e) => new Date(e.date).toDateString()));

  const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const candidates: { date: Date; score: number; reason: string }[] = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const key = d.toDateString();
    if (busy.has(key)) continue;
    const score = dowScores[d.getDay()];
    if (score <= 0) continue;
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

export default router;
