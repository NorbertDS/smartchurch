import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authenticate } from '../middleware/auth';
import { tenantContext, requireTenant } from '../middleware/tenant';

const router = Router();
router.use(authenticate);
router.use(tenantContext);

// Helpers
function canManage(role?: string | null) {
  return role && ['ADMIN','CLERK','PASTOR'].includes(role);
}

// Seed defaults per-tenant if empty
async function ensureDefaults(tenantId: number) {
  const count = await prisma.cellGroup.count({ where: { tenantId } });
  if (count === 0) {
    const names = [
      'Ruaraka Naivas','Huruma Kariobangi','Lucky Summer','Diaspora',
      'Area 1','Area 2','Area 3','Area 4'
    ];
    await prisma.cellGroup.createMany({ data: names.map(n => ({ name: n, tenantId })) });
  }
}

// List groups with optional search
router.get('/', requireTenant, async (req, res) => {
  const tid = (req as any).tenantId as number;
  await ensureDefaults(tid);
  const q = String(req.query.q || '').trim();
  const where = q
    ? { tenantId: tid, OR: [{ name: { contains: q } }, { location: { contains: q } }] }
    : { tenantId: tid };
  const groups = await prisma.cellGroup.findMany({ where, orderBy: { name: 'asc' } });
  res.json(groups);
});

// Create group (privileged)
router.post('/', requireTenant, async (req, res) => {
  const user = (req as any).user;
  if (!canManage(user?.role)) return res.status(403).json({ message: 'Forbidden' });
  const { name, description, location } = req.body || {};
  if (!name || String(name).trim().length < 2) return res.status(400).json({ message: 'Name is required' });
  const tid = (req as any).tenantId as number;
  const created = await prisma.cellGroup.create({ data: { name: String(name).trim(), description, location, createdById: user?.id, tenantId: tid } });
  await prisma.auditLog.create({ data: { userId: user?.id, action: 'CELL_GROUP_CREATE', entityType: 'CellGroup', entityId: created.id, tenantId: tid } });
  res.json(created);
});

// Update group
router.put('/:id', requireTenant, async (req, res) => {
  const user = (req as any).user;
  if (!canManage(user?.role)) return res.status(403).json({ message: 'Forbidden' });
  const id = Number(req.params.id);
  const { name, description, location } = req.body || {};
  const tid = (req as any).tenantId as number;
  const existing = await prisma.cellGroup.findFirst({ where: { id, tenantId: tid } });
  if (!existing) return res.status(404).json({ message: 'Cell group not found' });
  const updated = await prisma.cellGroup.update({ where: { id }, data: { name, description, location } });
  await prisma.auditLog.create({ data: { userId: user?.id, action: 'CELL_GROUP_UPDATE', entityType: 'CellGroup', entityId: id, tenantId: tid } });
  res.json(updated);
});

// Delete group
router.delete('/:id', requireTenant, async (req, res) => {
  const user = (req as any).user;
  if (!canManage(user?.role)) return res.status(403).json({ message: 'Forbidden' });
  const id = Number(req.params.id);
  const tid = (req as any).tenantId as number;
  const existing = await prisma.cellGroup.findFirst({ where: { id, tenantId: tid } });
  if (!existing) return res.status(404).json({ message: 'Cell group not found' });
  await prisma.cellGroup.delete({ where: { id } });
  await prisma.auditLog.create({ data: { userId: user?.id, action: 'CELL_GROUP_DELETE', entityType: 'CellGroup', entityId: id, tenantId: tid } });
  res.json({ ok: true });
});

// View members of a group, with contributions summary
router.get('/:id/members', requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const user = (req as any).user;
  const role = user?.role as string | undefined;
  const tid = (req as any).tenantId as number;

  const group = await prisma.cellGroup.findFirst({ where: { id, tenantId: tid } });
  if (!group) return res.status(404).json({ message: 'Cell group not found' });

  // If not privileged, ensure requester is a member of this group
  if (!canManage(role)) {
    const me = await prisma.member.findFirst({ where: { userId: user?.id, tenantId: tid } });
    if (!me) {
      await prisma.auditLog.create({ data: { userId: user?.id, action: 'UNAUTHORIZED_CELL_GROUP_ACCESS', entityType: 'CellGroup', entityId: id } });
      return res.status(403).json({ message: 'Forbidden' });
    }
    const inGroup = await prisma.cellGroupMembership.findFirst({ where: { groupId: id, memberId: me.id, leftAt: null, tenantId: tid } });
    if (!inGroup) {
      await prisma.auditLog.create({ data: { userId: user?.id, action: 'UNAUTHORIZED_CELL_GROUP_ACCESS', entityType: 'CellGroup', entityId: id } });
      return res.status(403).json({ message: 'Forbidden' });
    }
  }

  const memberships = await prisma.cellGroupMembership.findMany({
    where: { groupId: id, tenantId: tid, OR: [{ leftAt: null }, { leftAt: { equals: null } }] },
    include: { member: true, contributions: true },
    orderBy: { registeredAt: 'desc' },
  });

  // Restrict member payload for non-privileged viewers
  const sanitized = canManage(role)
    ? memberships
    : memberships.map(ms => ({
        ...ms,
        member: (ms as any).member ? { id: (ms as any).member.id, firstName: (ms as any).member.firstName, lastName: (ms as any).member.lastName, contact: (ms as any).member.contact || null } : null,
        contributions: ((ms as any).member && (ms as any).member.userId === user?.id) ? (ms as any).contributions : [],
      }));

  res.json(sanitized);
});

// Register to group (self or admin registers others)
router.post('/:id/register', requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const user = (req as any).user;
  const tid = (req as any).tenantId as number;
  const group = await prisma.cellGroup.findFirst({ where: { id, tenantId: tid } });
  if (!group) return res.status(404).json({ message: 'Cell group not found' });
  const { memberId, registeredAt, notes } = req.body || {};
  let targetMemberId = Number(memberId);
  if (!targetMemberId) {
    // Find current user's member profile
    const me = await prisma.member.findFirst({ where: { userId: user?.id, tenantId: tid } });
    if (!me) return res.status(400).json({ message: 'No linked member profile' });
    targetMemberId = me.id;
  }
  // Check existing active membership
  const existing = await prisma.cellGroupMembership.findFirst({ where: { groupId: id, memberId: targetMemberId, leftAt: null, tenantId: tid } });
  if (existing) return res.status(400).json({ message: 'Already registered to this group' });
  const created = await prisma.cellGroupMembership.create({
    data: {
      groupId: id,
      memberId: targetMemberId,
      registeredAt: registeredAt ? new Date(registeredAt) : undefined,
      notes,
      registeredById: user?.id,
      tenantId: tid,
    }
  });
  // Update member profile last modified via a safe field and set ACTIVE status
  const member = await prisma.member.findUnique({ where: { id: targetMemberId } });
  await prisma.member.update({ where: { id: targetMemberId }, data: { membershipStatus: member?.membershipStatus || 'ACTIVE' } });
  // Audit profile affiliation update
  await prisma.auditLog.create({ data: { userId: user?.id, action: 'PROFILE_UPDATE_GROUP_AFFILIATION', entityType: 'Member', entityId: targetMemberId, tenantId: tid } });
  await prisma.auditLog.create({ data: { userId: user?.id, action: 'CELL_GROUP_REGISTER', entityType: 'CellGroupMembership', entityId: created.id, tenantId: tid } });
  res.json(created);
});

// Leave group (self or admin)
router.post('/:id/leave', requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const user = (req as any).user;
  const tid = (req as any).tenantId as number;
  const group = await prisma.cellGroup.findFirst({ where: { id, tenantId: tid } });
  if (!group) return res.status(404).json({ message: 'Cell group not found' });
  const { memberId } = req.body || {};
  let targetMemberId = Number(memberId);
  if (!targetMemberId) {
    const me = await prisma.member.findFirst({ where: { userId: user?.id, tenantId: tid } });
    if (!me) return res.status(400).json({ message: 'No linked member profile' });
    targetMemberId = me.id;
  }
  const existing = await prisma.cellGroupMembership.findFirst({ where: { groupId: id, memberId: targetMemberId, leftAt: null, tenantId: tid } });
  if (!existing) return res.status(404).json({ message: 'Membership not found' });
  await prisma.cellGroupMembership.update({ where: { id: existing.id }, data: { leftAt: new Date() } });
  await prisma.auditLog.create({ data: { userId: user?.id, action: 'CELL_GROUP_LEAVE', entityType: 'CellGroupMembership', entityId: existing.id, tenantId: tid } });
  res.json({ ok: true });
});

// Add contribution for membership
router.post('/:id/contributions', requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const user = (req as any).user;
  const role = user?.role as string | undefined;
  const tid = (req as any).tenantId as number;
  const { memberId, membershipId, amount, date, notes } = req.body || {};
  const amt = Number(amount);
  if (!amt || amt <= 0) return res.status(400).json({ message: 'Amount must be positive' });
  let memId = Number(membershipId);
  if (!memId) {
    const targetMemberId = Number(memberId) || (await prisma.member.findFirst({ where: { userId: user?.id, tenantId: tid } }))?.id;
    if (!targetMemberId) return res.status(400).json({ message: 'Member not specified' });
    const membership = await prisma.cellGroupMembership.findFirst({ where: { groupId: id, memberId: targetMemberId, leftAt: null, tenantId: tid } });
    if (!membership) return res.status(404).json({ message: 'Active membership not found' });
    memId = membership.id;
  }
  // Secure recording: if not privileged, only allow contribution to own active membership
  if (!canManage(role)) {
    const myMember = await prisma.member.findFirst({ where: { userId: user?.id, tenantId: tid } as any });
    const myMembership = myMember ? await prisma.cellGroupMembership.findFirst({ where: { groupId: id, memberId: myMember.id, leftAt: null, tenantId: tid } }) : null;
    if (!myMembership || myMembership.id !== memId) {
      await prisma.auditLog.create({ data: { userId: user?.id, action: 'CELL_GROUP_CONTRIBUTE_DENIED', entityType: 'CellGroupMembership', entityId: memId } });
      return res.status(403).json({ message: 'Forbidden: cannot record contributions for other members' });
    }
  }
  const created = await prisma.cellGroupContribution.create({
    data: { membershipId: memId, amount: amt, date: date ? new Date(date) : undefined, notes, createdById: user?.id, tenantId: tid }
  });
  await prisma.auditLog.create({ data: { userId: user?.id, action: 'CELL_GROUP_CONTRIBUTE', entityType: 'CellGroupContribution', entityId: created.id, tenantId: tid } });
  res.json(created);
});

// List contributions for a group
router.get('/:id/contributions', requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const tid = (req as any).tenantId as number;
  const items = await prisma.cellGroupContribution.findMany({
    where: { tenantId: tid, membership: { groupId: id } },
    include: { membership: { include: { member: true } } },
    orderBy: { date: 'desc' },
  });
  res.json(items);
});

// Member’s groups
router.get('/member/:memberId', requireTenant, async (req, res) => {
  const memberId = Number(req.params.memberId);
  const tid = (req as any).tenantId as number;
  const memberships = await prisma.cellGroupMembership.findMany({ where: { memberId, leftAt: null, tenantId: tid }, include: { group: true } });
  res.json(memberships);
});

// Group summary: metadata, member count, contributions summary, rankings, upcoming schedule
router.get('/:id/summary', requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const tid = (req as any).tenantId as number;
  const group = await prisma.cellGroup.findFirst({ where: { id, tenantId: tid } });
  if (!group) return res.status(404).json({ message: 'Cell group not found' });
  const memberships = await prisma.cellGroupMembership.findMany({ where: { groupId: id, leftAt: null, tenantId: tid }, include: { member: true, contributions: true } });
  const memberCount = memberships.length;
  const totalContributions = (memberships as any[]).reduce((sum, ms: any) => sum + ((ms.contributions || []) as any[]).reduce((s: number, c: any) => s + Number(c.amount || 0), 0), 0);
  const perMemberTotals = (memberships as any[]).map((ms: any) => ({ memberId: ms.memberId, name: ms.member ? `${ms.member.firstName} ${ms.member.lastName}` : `#${ms.memberId}`, total: ((ms.contributions || []) as any[]).reduce((s: number, c: any) => s + Number(c.amount || 0), 0) })).sort((a: any,b: any)=> b.total - a.total);
  // Rankings across all groups by total contributions
  const allGroups = await prisma.cellGroup.findMany({ where: { tenantId: tid } as any });
  const totalsByGroup = await Promise.all(allGroups.map(async g => {
    const ms = await prisma.cellGroupMembership.findMany({ where: { groupId: g.id, leftAt: null, tenantId: tid } as any, include: { contributions: true } });
    const total = (ms as any[]).reduce((sum: number, m: any) => sum + ((m.contributions || []) as any[]).reduce((s: number, c: any) => s + Number(c.amount || 0), 0), 0);
    return { groupId: g.id, name: g.name, total };
  }));
  totalsByGroup.sort((a,b)=> b.total - a.total);
  const performanceRank = totalsByGroup.findIndex(t => t.groupId === id) + 1;
  // Upcoming schedule: pick future events/programs matching group location/name
  const now = new Date();
  // Build OR filters without query mode to support SQLite/dev setups
  const eventWhere: any = {
    date: { gte: now },
    tenantId: tid,
    OR: [
      ...(group.location ? [{ location: { contains: group.location } }] : []),
      { title: { contains: group.name } }
    ]
  };
  const programWhere: any = {
    startDate: { gte: now },
    tenantId: tid,
    OR: [
      ...(group.location ? [{ location: { contains: group.location } }] : []),
      { name: { contains: group.name } }
    ]
  };
  let upcomingEvents = [] as any[];
  let upcomingPrograms = [] as any[];
  try {
    upcomingEvents = await prisma.event.findMany({ where: eventWhere, orderBy: { date: 'asc' }, take: 5 });
    upcomingPrograms = await prisma.program.findMany({ where: programWhere, orderBy: { startDate: 'asc' }, take: 5 });
  } catch (err) {
    // Ensure consistent JSON error and continue with empty schedules
    console.error('CellGroup summary schedule query failed:', err);
    upcomingEvents = [];
    upcomingPrograms = [];
  }
  res.json({
    metadata: { id: group.id, name: group.name, description: group.description, location: group.location },
    memberCount,
    contributions: { total: totalContributions, perMemberTotals },
    rankings: { performanceRank, totalGroups: allGroups.length },
    upcomingSchedule: {
      events: upcomingEvents.map(e => ({ id: e.id, title: e.title, date: e.date, location: e.location })),
      programs: upcomingPrograms.map(p => ({ id: p.id, name: p.name, startDate: p.startDate, location: p.location }))
    }
  });
});

export default router;
