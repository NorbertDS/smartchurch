import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { tenantContext, requireTenant } from '../middleware/tenant';

const router = Router();
router.use(authenticate);
router.use(tenantContext);

// List departments
router.get('/', requireTenant, async (req, res) => {
  const tid = (req as any).tenantId as number;
  const list = await prisma.department.findMany({ where: { tenantId: tid }, orderBy: { name: 'asc' } });
  res.json(list);
});

// Get department details
router.get('/:id', requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const tid = (req as any).tenantId as number;
  const dep = await prisma.department.findFirst({
    where: { id, tenantId: tid },
    include: {
      leader: true,
      members: true,
      events: true,
    },
  });
  if (!dep) return res.status(404).json({ message: 'Department not found' });
  res.json(dep);
});

// Create department
router.post('/', requireRole(['ADMIN', 'CLERK', 'PASTOR']), requireTenant, async (req, res) => {
  const { name, description, leaderId } = req.body as { name: string; description?: string; leaderId?: number };
  const tid = (req as any).tenantId as number;
  const dep = await prisma.department.create({ data: { name, description, leaderId, tenantId: tid } });
  res.status(201).json(dep);
});

// Update department
router.put('/:id', requireRole(['ADMIN', 'CLERK', 'PASTOR']), requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const tid = (req as any).tenantId as number;
  const { name, description, leaderId } = req.body as { name?: string; description?: string; leaderId?: number | null };
  const updated = await prisma.department.update({ where: { id }, data: { name, description, leaderId, tenantId: tid } });
  res.json(updated);
});

// Delete department
router.delete('/:id', requireRole(['ADMIN', 'CLERK']), requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const tid = (req as any).tenantId as number;
  const dep = await prisma.department.findFirst({ where: { id, tenantId: tid } });
  if (!dep) return res.status(404).json({ message: 'Department not found' });
  await prisma.department.delete({ where: { id } });
  res.status(204).end();
});

// Assign/Change leader by userId
router.post('/:id/assign-leader', requireRole(['ADMIN', 'CLERK', 'PASTOR']), requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const tid = (req as any).tenantId as number;
  const { leaderId } = req.body as { leaderId: number | null };
  const updated = await prisma.department.update({ where: { id }, data: { leaderId, tenantId: tid } });
  res.json(updated);
});

// Assign leader by memberId (uses member.userId)
router.post('/:id/assign-leader-member', requireRole(['ADMIN', 'CLERK', 'PASTOR']), requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const { memberId } = req.body as { memberId: number };
  if (!memberId) return res.status(400).json({ message: 'memberId is required' });
  const tid = (req as any).tenantId as number;
  const member = await prisma.member.findFirst({ where: { id: memberId, tenantId: tid } });
  if (!member) return res.status(404).json({ message: 'Member not found' });
  if (!member.userId) return res.status(400).json({ message: 'Selected member has no linked user account' });
  const updated = await prisma.department.update({ where: { id }, data: { leaderId: member.userId, tenantId: tid } });
  res.json(updated);
});

// Add member to department (set member.departmentId)
router.post('/:id/members/:memberId', requireRole(['ADMIN', 'CLERK', 'PASTOR']), requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const memberId = Number(req.params.memberId);
  const tid = (req as any).tenantId as number;
  const updated = await prisma.member.update({ where: { id: memberId }, data: { departmentId: id, tenantId: tid } });
  res.status(200).json(updated);
});

// Remove member from department (set member.departmentId = null)
router.delete('/:id/members/:memberId', requireRole(['ADMIN', 'CLERK', 'PASTOR']), requireTenant, async (req, res) => {
  const memberId = Number(req.params.memberId);
  const tid = (req as any).tenantId as number;
  const updated = await prisma.member.update({ where: { id: memberId }, data: { departmentId: null, tenantId: tid } });
  res.status(200).json(updated);
});

// Self-join department (member joins themselves without staff restriction)
router.post('/:id/join', requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const user = (req as any).user;
  if (!user) return res.status(401).json({ message: 'Unauthenticated' });
  const tid = (req as any).tenantId as number;
  const member = await prisma.member.findFirst({ where: { userId: user.id, tenantId: tid } });
  if (!member) return res.status(404).json({ message: 'No linked member profile' });
  const updated = await prisma.member.update({ where: { id: member.id }, data: { departmentId: id, tenantId: tid } });
  res.status(200).json(updated);
});

// Multi-membership: list members via join table
router.get('/:id/memberships', requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const tid = (req as any).tenantId as number;
    const members = await prisma.$queryRaw<any[]>`SELECT m.* FROM MemberDepartment md JOIN Member m ON m.id = md.memberId WHERE md.departmentId = ${id} AND m.tenantId = ${tid} ORDER BY m.lastName ASC, m.firstName ASC`;
    res.json(members);
  } catch (e) {
    res.status(500).json({ message: 'Failed to load memberships', error: String(e) });
  }
});

// Multi-membership: add link (idempotent)
router.post('/:id/memberships', requireRole(['ADMIN', 'CLERK', 'PASTOR']), requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const { memberId, role } = req.body as { memberId: number; role?: string };
  if (!memberId) return res.status(400).json({ message: 'memberId is required' });
  try {
    await prisma.$executeRawUnsafe('INSERT OR IGNORE INTO MemberDepartment (memberId, departmentId, role, joinedAt) VALUES (?, ?, ?, CURRENT_TIMESTAMP)', memberId, id, role || null);
    res.status(201).json({ memberId, departmentId: id });
  } catch (e) {
    res.status(500).json({ message: 'Failed to add membership', error: String(e) });
  }
});

// Multi-membership: remove link
router.delete('/:id/memberships/:memberId', requireRole(['ADMIN', 'CLERK', 'PASTOR']), requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const memberId = Number(req.params.memberId);
  try {
    await prisma.$executeRawUnsafe('DELETE FROM MemberDepartment WHERE memberId = ? AND departmentId = ?', memberId, id);
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Failed to remove membership', error: String(e) });
  }
});
// List department meetings (events with departmentId)
router.get('/:id/meetings', requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const tid = (req as any).tenantId as number;
  const events = await prisma.event.findMany({ where: { departmentId: id, tenantId: tid }, orderBy: { date: 'asc' } });
  res.json(events);
});

// Schedule a department meeting (create event)
router.post('/:id/meetings', requireRole(['ADMIN', 'CLERK', 'PASTOR']), requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const { title, description, date, location } = req.body as { title: string; description?: string; date: string; location?: string };
  const tid = (req as any).tenantId as number;
  const ev = await prisma.event.create({ data: { title, description, date: new Date(date), location, departmentId: id, tenantId: tid } });
  res.status(201).json(ev);
});

// Department report: members count, upcoming meetings count, attendance summary per month
router.get('/:id/report', requireRole(['ADMIN', 'CLERK', 'PASTOR']), requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const tid = (req as any).tenantId as number;
  const [membersCount, upcomingMeetings, records] = await Promise.all([
    prisma.member.count({ where: { departmentId: id, tenantId: tid } }),
    prisma.event.count({ where: { departmentId: id, tenantId: tid, date: { gte: new Date() } } }),
    prisma.attendanceRecord.findMany({ where: { departmentId: id, tenantId: tid }, include: { entries: true } }),
  ]);
  const map = new Map<string, number>();
  records.forEach(r => {
    const key = `${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2, '0')}`;
    const present = r.entries.filter(e => e.present).length;
    map.set(key, (map.get(key) || 0) + present);
  });
  const attendanceMonthly = Array.from(map.entries()).map(([month, total]) => ({ month, total }));
  res.json({ membersCount, upcomingMeetings, attendanceMonthly });
});

export default router;
