"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../config/prisma");
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.use(tenant_1.tenantContext);
// Helpers
function canManage(role) {
    return role && ['ADMIN', 'CLERK', 'PASTOR'].includes(role);
}
// Seed defaults per-tenant if empty
async function ensureDefaults(tenantId) {
    const count = await prisma_1.prisma.cellGroup.count({ where: { tenantId } });
    if (count === 0) {
        const names = [
            'Ruaraka Naivas', 'Huruma Kariobangi', 'Lucky Summer', 'Diaspora',
            'Area 1', 'Area 2', 'Area 3', 'Area 4'
        ];
        await prisma_1.prisma.cellGroup.createMany({ data: names.map(n => ({ name: n, tenantId })) });
    }
}
// List groups with optional search
router.get('/', tenant_1.requireTenant, async (req, res) => {
    const tid = req.tenantId;
    await ensureDefaults(tid);
    const q = String(req.query.q || '').trim();
    const where = q
        ? { tenantId: tid, OR: [{ name: { contains: q } }, { location: { contains: q } }] }
        : { tenantId: tid };
    const groups = await prisma_1.prisma.cellGroup.findMany({ where, orderBy: { name: 'asc' } });
    res.json(groups);
});
// Create group (privileged)
router.post('/', tenant_1.requireTenant, async (req, res) => {
    const user = req.user;
    if (!canManage(user?.role))
        return res.status(403).json({ message: 'Forbidden' });
    const { name, description, location } = req.body || {};
    if (!name || String(name).trim().length < 2)
        return res.status(400).json({ message: 'Name is required' });
    const tid = req.tenantId;
    const created = await prisma_1.prisma.cellGroup.create({ data: { name: String(name).trim(), description, location, createdById: user?.id, tenantId: tid } });
    await prisma_1.prisma.auditLog.create({ data: { userId: user?.id, action: 'CELL_GROUP_CREATE', entityType: 'CellGroup', entityId: created.id, tenantId: tid } });
    res.json(created);
});
// Update group
router.put('/:id', tenant_1.requireTenant, async (req, res) => {
    const user = req.user;
    if (!canManage(user?.role))
        return res.status(403).json({ message: 'Forbidden' });
    const id = Number(req.params.id);
    const { name, description, location } = req.body || {};
    const tid = req.tenantId;
    const existing = await prisma_1.prisma.cellGroup.findFirst({ where: { id, tenantId: tid } });
    if (!existing)
        return res.status(404).json({ message: 'Cell group not found' });
    const updated = await prisma_1.prisma.cellGroup.update({ where: { id }, data: { name, description, location } });
    await prisma_1.prisma.auditLog.create({ data: { userId: user?.id, action: 'CELL_GROUP_UPDATE', entityType: 'CellGroup', entityId: id, tenantId: tid } });
    res.json(updated);
});
// Delete group
router.delete('/:id', tenant_1.requireTenant, async (req, res) => {
    const user = req.user;
    if (!canManage(user?.role))
        return res.status(403).json({ message: 'Forbidden' });
    const id = Number(req.params.id);
    const tid = req.tenantId;
    const existing = await prisma_1.prisma.cellGroup.findFirst({ where: { id, tenantId: tid } });
    if (!existing)
        return res.status(404).json({ message: 'Cell group not found' });
    await prisma_1.prisma.cellGroup.delete({ where: { id } });
    await prisma_1.prisma.auditLog.create({ data: { userId: user?.id, action: 'CELL_GROUP_DELETE', entityType: 'CellGroup', entityId: id, tenantId: tid } });
    res.json({ ok: true });
});
// View members of a group, with contributions summary
router.get('/:id/members', tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const user = req.user;
    const role = user?.role;
    const tid = req.tenantId;
    const group = await prisma_1.prisma.cellGroup.findFirst({ where: { id, tenantId: tid } });
    if (!group)
        return res.status(404).json({ message: 'Cell group not found' });
    // If not privileged, ensure requester is a member of this group
    if (!canManage(role)) {
        const me = await prisma_1.prisma.member.findFirst({ where: { userId: user?.id, tenantId: tid } });
        if (!me) {
            await prisma_1.prisma.auditLog.create({ data: { userId: user?.id, action: 'UNAUTHORIZED_CELL_GROUP_ACCESS', entityType: 'CellGroup', entityId: id } });
            return res.status(403).json({ message: 'Forbidden' });
        }
        const inGroup = await prisma_1.prisma.cellGroupMembership.findFirst({ where: { groupId: id, memberId: me.id, leftAt: null, tenantId: tid } });
        if (!inGroup) {
            await prisma_1.prisma.auditLog.create({ data: { userId: user?.id, action: 'UNAUTHORIZED_CELL_GROUP_ACCESS', entityType: 'CellGroup', entityId: id } });
            return res.status(403).json({ message: 'Forbidden' });
        }
    }
    const memberships = await prisma_1.prisma.cellGroupMembership.findMany({
        where: { groupId: id, tenantId: tid, OR: [{ leftAt: null }, { leftAt: { equals: null } }] },
        include: { member: true, contributions: true },
        orderBy: { registeredAt: 'desc' },
    });
    // Restrict member payload for non-privileged viewers
    const sanitized = canManage(role)
        ? memberships
        : memberships.map(ms => ({
            ...ms,
            member: ms.member ? { id: ms.member.id, firstName: ms.member.firstName, lastName: ms.member.lastName, contact: ms.member.contact || null } : null,
            contributions: (ms.member && ms.member.userId === user?.id) ? ms.contributions : [],
        }));
    res.json(sanitized);
});
// Register to group (self or admin registers others)
router.post('/:id/register', tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const user = req.user;
    const tid = req.tenantId;
    const group = await prisma_1.prisma.cellGroup.findFirst({ where: { id, tenantId: tid } });
    if (!group)
        return res.status(404).json({ message: 'Cell group not found' });
    const { memberId, registeredAt, notes } = req.body || {};
    let targetMemberId = Number(memberId);
    if (!targetMemberId) {
        // Find current user's member profile
        const me = await prisma_1.prisma.member.findFirst({ where: { userId: user?.id, tenantId: tid } });
        if (!me)
            return res.status(400).json({ message: 'No linked member profile' });
        targetMemberId = me.id;
    }
    // Check existing active membership
    const existing = await prisma_1.prisma.cellGroupMembership.findFirst({ where: { groupId: id, memberId: targetMemberId, leftAt: null, tenantId: tid } });
    if (existing)
        return res.status(400).json({ message: 'Already registered to this group' });
    const created = await prisma_1.prisma.cellGroupMembership.create({
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
    const member = await prisma_1.prisma.member.findUnique({ where: { id: targetMemberId } });
    await prisma_1.prisma.member.update({ where: { id: targetMemberId }, data: { membershipStatus: member?.membershipStatus || 'ACTIVE' } });
    // Audit profile affiliation update
    await prisma_1.prisma.auditLog.create({ data: { userId: user?.id, action: 'PROFILE_UPDATE_GROUP_AFFILIATION', entityType: 'Member', entityId: targetMemberId, tenantId: tid } });
    await prisma_1.prisma.auditLog.create({ data: { userId: user?.id, action: 'CELL_GROUP_REGISTER', entityType: 'CellGroupMembership', entityId: created.id, tenantId: tid } });
    res.json(created);
});
// Leave group (self or admin)
router.post('/:id/leave', tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const user = req.user;
    const tid = req.tenantId;
    const group = await prisma_1.prisma.cellGroup.findFirst({ where: { id, tenantId: tid } });
    if (!group)
        return res.status(404).json({ message: 'Cell group not found' });
    const { memberId } = req.body || {};
    let targetMemberId = Number(memberId);
    if (!targetMemberId) {
        const me = await prisma_1.prisma.member.findFirst({ where: { userId: user?.id, tenantId: tid } });
        if (!me)
            return res.status(400).json({ message: 'No linked member profile' });
        targetMemberId = me.id;
    }
    const existing = await prisma_1.prisma.cellGroupMembership.findFirst({ where: { groupId: id, memberId: targetMemberId, leftAt: null, tenantId: tid } });
    if (!existing)
        return res.status(404).json({ message: 'Membership not found' });
    await prisma_1.prisma.cellGroupMembership.update({ where: { id: existing.id }, data: { leftAt: new Date() } });
    await prisma_1.prisma.auditLog.create({ data: { userId: user?.id, action: 'CELL_GROUP_LEAVE', entityType: 'CellGroupMembership', entityId: existing.id, tenantId: tid } });
    res.json({ ok: true });
});
// Add contribution for membership
router.post('/:id/contributions', tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const user = req.user;
    const role = user?.role;
    const tid = req.tenantId;
    const { memberId, membershipId, amount, date, notes } = req.body || {};
    const amt = Number(amount);
    if (!amt || amt <= 0)
        return res.status(400).json({ message: 'Amount must be positive' });
    let memId = Number(membershipId);
    if (!memId) {
        const targetMemberId = Number(memberId) || (await prisma_1.prisma.member.findFirst({ where: { userId: user?.id, tenantId: tid } }))?.id;
        if (!targetMemberId)
            return res.status(400).json({ message: 'Member not specified' });
        const membership = await prisma_1.prisma.cellGroupMembership.findFirst({ where: { groupId: id, memberId: targetMemberId, leftAt: null, tenantId: tid } });
        if (!membership)
            return res.status(404).json({ message: 'Active membership not found' });
        memId = membership.id;
    }
    // Secure recording: if not privileged, only allow contribution to own active membership
    if (!canManage(role)) {
        const myMember = await prisma_1.prisma.member.findFirst({ where: { userId: user?.id, tenantId: tid } });
        const myMembership = myMember ? await prisma_1.prisma.cellGroupMembership.findFirst({ where: { groupId: id, memberId: myMember.id, leftAt: null, tenantId: tid } }) : null;
        if (!myMembership || myMembership.id !== memId) {
            await prisma_1.prisma.auditLog.create({ data: { userId: user?.id, action: 'CELL_GROUP_CONTRIBUTE_DENIED', entityType: 'CellGroupMembership', entityId: memId } });
            return res.status(403).json({ message: 'Forbidden: cannot record contributions for other members' });
        }
    }
    const created = await prisma_1.prisma.cellGroupContribution.create({
        data: { membershipId: memId, amount: amt, date: date ? new Date(date) : undefined, notes, createdById: user?.id, tenantId: tid }
    });
    await prisma_1.prisma.auditLog.create({ data: { userId: user?.id, action: 'CELL_GROUP_CONTRIBUTE', entityType: 'CellGroupContribution', entityId: created.id, tenantId: tid } });
    res.json(created);
});
// List contributions for a group
router.get('/:id/contributions', tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const tid = req.tenantId;
    const items = await prisma_1.prisma.cellGroupContribution.findMany({
        where: { tenantId: tid, membership: { groupId: id } },
        include: { membership: { include: { member: true } } },
        orderBy: { date: 'desc' },
    });
    res.json(items);
});
// Member’s groups
router.get('/member/:memberId', tenant_1.requireTenant, async (req, res) => {
    const memberId = Number(req.params.memberId);
    const tid = req.tenantId;
    const memberships = await prisma_1.prisma.cellGroupMembership.findMany({ where: { memberId, leftAt: null, tenantId: tid }, include: { group: true } });
    res.json(memberships);
});
// Group summary: metadata, member count, contributions summary, rankings, upcoming schedule
router.get('/:id/summary', tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const tid = req.tenantId;
    const group = await prisma_1.prisma.cellGroup.findFirst({ where: { id, tenantId: tid } });
    if (!group)
        return res.status(404).json({ message: 'Cell group not found' });
    const memberships = await prisma_1.prisma.cellGroupMembership.findMany({ where: { groupId: id, leftAt: null, tenantId: tid }, include: { member: true, contributions: true } });
    const memberCount = memberships.length;
    const totalContributions = memberships.reduce((sum, ms) => sum + (ms.contributions || []).reduce((s, c) => s + Number(c.amount || 0), 0), 0);
    const perMemberTotals = memberships.map((ms) => ({ memberId: ms.memberId, name: ms.member ? `${ms.member.firstName} ${ms.member.lastName}` : `#${ms.memberId}`, total: (ms.contributions || []).reduce((s, c) => s + Number(c.amount || 0), 0) })).sort((a, b) => b.total - a.total);
    // Rankings across all groups by total contributions
    const allGroups = await prisma_1.prisma.cellGroup.findMany({ where: { tenantId: tid } });
    const totalsByGroup = await Promise.all(allGroups.map(async (g) => {
        const ms = await prisma_1.prisma.cellGroupMembership.findMany({ where: { groupId: g.id, leftAt: null, tenantId: tid }, include: { contributions: true } });
        const total = ms.reduce((sum, m) => sum + (m.contributions || []).reduce((s, c) => s + Number(c.amount || 0), 0), 0);
        return { groupId: g.id, name: g.name, total };
    }));
    totalsByGroup.sort((a, b) => b.total - a.total);
    const performanceRank = totalsByGroup.findIndex(t => t.groupId === id) + 1;
    // Upcoming schedule: pick future events/programs matching group location/name
    const now = new Date();
    // Build OR filters without query mode to support SQLite/dev setups
    const eventWhere = {
        date: { gte: now },
        tenantId: tid,
        OR: [
            ...(group.location ? [{ location: { contains: group.location } }] : []),
            { title: { contains: group.name } }
        ]
    };
    const programWhere = {
        startDate: { gte: now },
        tenantId: tid,
        OR: [
            ...(group.location ? [{ location: { contains: group.location } }] : []),
            { name: { contains: group.name } }
        ]
    };
    let upcomingEvents = [];
    let upcomingPrograms = [];
    try {
        upcomingEvents = await prisma_1.prisma.event.findMany({ where: eventWhere, orderBy: { date: 'asc' }, take: 5 });
        upcomingPrograms = await prisma_1.prisma.program.findMany({ where: programWhere, orderBy: { startDate: 'asc' }, take: 5 });
    }
    catch (err) {
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
exports.default = router;
