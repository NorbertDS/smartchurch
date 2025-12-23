"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../config/prisma");
const auth_1 = require("../middleware/auth");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const multer_1 = __importDefault(require("multer"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const otplib_1 = require("otplib");
const features_1 = require("../core/features");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.use((0, auth_1.requireRole)(['PROVIDER_ADMIN']));
const restartOps = new Map();
const restartAttempts = new Map();
function isRestartEnabled() {
    const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
    if (!isProd)
        return true;
    return String(process.env.ENABLE_PROVIDER_RESTART || '').toLowerCase() === 'true';
}
function rateLimitOrThrow(userId, key) {
    const windowMs = 10 * 60 * 1000;
    const max = 3;
    const now = Date.now();
    const k = `${userId}:${key}`;
    const prev = (restartAttempts.get(k) || []).filter((t) => now - t < windowMs);
    if (prev.length >= max) {
        const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - prev[0])) / 1000));
        const err = new Error('RATE_LIMIT');
        err.retryAfterSec = retryAfterSec;
        throw err;
    }
    prev.push(now);
    restartAttempts.set(k, prev);
}
router.get('/tenants', async (req, res) => {
    const { q, page, pageSize, sort, order, status } = req.query;
    const take = Math.max(1, Math.min(100, Number(pageSize) || 20));
    const pageNum = Math.max(1, Number(page) || 1);
    const skip = (pageNum - 1) * take;
    const where = {};
    if (q)
        where.OR = [{ name: { contains: String(q), mode: 'insensitive' } }, { slug: { contains: String(q), mode: 'insensitive' } }];
    if (status) {
        const s = String(status || '').trim().toUpperCase();
        if (['ACTIVE', 'SUSPENDED', 'ARCHIVED'].includes(s))
            where.status = s;
    }
    const sortKey = String(sort || 'createdAt');
    const sortDir = String(order || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    const orderBy = sortKey === 'name'
        ? { name: sortDir }
        : sortKey === 'slug'
            ? { slug: sortDir }
            : sortKey === 'status'
                ? { status: sortDir }
                : { createdAt: sortDir };
    const [items, total] = await Promise.all([
        prisma_1.prisma.tenant.findMany({ where, orderBy, skip, take }),
        prisma_1.prisma.tenant.count({ where }),
    ]);
    res.json({ items, total, page: pageNum, pageSize: take });
});
router.get('/stats/overview', async (req, res) => {
    const days = Math.max(7, Math.min(90, Number(req.query.days || 30)));
    const now = new Date();
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const [totalTenants, activeTenants, suspendedTenants, archivedTenants, created] = await Promise.all([
        prisma_1.prisma.tenant.count({}),
        prisma_1.prisma.tenant.count({ where: { status: 'ACTIVE' } }),
        prisma_1.prisma.tenant.count({ where: { status: 'SUSPENDED' } }),
        prisma_1.prisma.tenant.count({ where: { status: 'ARCHIVED' } }),
        prisma_1.prisma.tenant.findMany({ where: { createdAt: { gte: from } }, select: { createdAt: true } }),
    ]);
    const byDay = {};
    for (const t of created) {
        const key = new Date(t.createdAt).toISOString().slice(0, 10);
        byDay[key] = (byDay[key] || 0) + 1;
    }
    const labels = [];
    const values = [];
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().slice(0, 10);
        labels.push(key);
        values.push(byDay[key] || 0);
    }
    res.json({
        tenants: {
            total: totalTenants,
            active: activeTenants,
            suspended: suspendedTenants,
            archived: archivedTenants,
        },
        createdSeries: { labels, values, from: from.toISOString(), to: now.toISOString() },
    });
});
router.get('/activity', async (req, res) => {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50)));
    const logs = await prisma_1.prisma.auditLog.findMany({
        where: { action: { startsWith: 'PROVIDER_' } },
        orderBy: { timestamp: 'desc' },
        take: limit,
        include: {
            user: { select: { id: true, name: true, email: true, role: true } },
            tenant: { select: { id: true, name: true, slug: true } },
        },
    });
    res.json(logs);
});
router.get('/admins', async (_req, res) => {
    const items = await prisma_1.prisma.user.findMany({
        where: { role: 'PROVIDER_ADMIN' },
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, email: true, twoFactorEnabled: true, createdAt: true, updatedAt: true },
    });
    res.json({ items });
});
router.post('/admins', auth_1.requireCsrf, async (req, res) => {
    const actorId = req.user?.id;
    if (!actorId)
        return res.status(401).json({ message: 'Unauthenticated' });
    const { email, password, name } = req.body;
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanName = String(name || 'Provider Admin').trim();
    const cleanPassword = String(password || '');
    if (!cleanEmail)
        return res.status(400).json({ message: 'Email is required' });
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail))
        return res.status(400).json({ message: 'Invalid email' });
    if (!cleanPassword || cleanPassword.length < 8)
        return res.status(400).json({ message: 'Password must be at least 8 characters' });
    const exists = await prisma_1.prisma.user.findFirst({ where: { email: cleanEmail, role: 'PROVIDER_ADMIN' } });
    if (exists)
        return res.status(409).json({ message: 'Provider admin already exists with this email' });
    const hash = await bcryptjs_1.default.hash(cleanPassword, 10);
    const created = await prisma_1.prisma.user.create({ data: { name: cleanName, email: cleanEmail, passwordHash: hash, role: 'PROVIDER_ADMIN', tenantId: null } });
    try {
        await prisma_1.prisma.auditLog.create({ data: { userId: actorId, action: 'PROVIDER_ADMIN_CREATED', entityType: 'User', entityId: created.id } });
    }
    catch { }
    res.status(201).json({ id: created.id, email: created.email, name: created.name });
});
router.post('/admins/:id/reset-password', auth_1.requireCsrf, async (req, res) => {
    const actorId = req.user?.id;
    if (!actorId)
        return res.status(401).json({ message: 'Unauthenticated' });
    const id = Number(req.params.id);
    if (!id || !isFinite(id))
        return res.status(400).json({ message: 'Invalid id' });
    if (id === actorId)
        return res.status(400).json({ message: 'You cannot reset your own password here' });
    const user = await prisma_1.prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== 'PROVIDER_ADMIN')
        return res.status(404).json({ message: 'Provider admin not found' });
    const incoming = String(req.body?.newPassword || '');
    const tempPassword = incoming && incoming.length >= 8 ? incoming : crypto_1.default.randomBytes(9).toString('base64url');
    const hash = await bcryptjs_1.default.hash(tempPassword, 10);
    await prisma_1.prisma.user.update({ where: { id }, data: { passwordHash: hash, resetTokenHash: null, resetTokenExpiresAt: null } });
    try {
        await prisma_1.prisma.auditLog.create({ data: { userId: actorId, action: 'PROVIDER_ADMIN_PASSWORD_RESET', entityType: 'User', entityId: id } });
    }
    catch { }
    res.json({ status: 'reset', id, email: user.email, tempPassword });
});
router.get('/tenants/:id', async (req, res) => {
    const id = Number(req.params.id);
    const t = await prisma_1.prisma.tenant.findUnique({ where: { id } });
    if (!t)
        return res.status(404).json({ message: 'Tenant not found' });
    res.json(t);
});
router.get('/tenants/:id/audit-logs', async (req, res) => {
    const id = Number(req.params.id);
    const limit = Number(req.query.limit || 50);
    const q = String(req.query.q || '').trim();
    const where = { tenantId: id };
    if (q)
        where.action = { contains: q };
    const logs = await prisma_1.prisma.auditLog.findMany({ where, orderBy: { timestamp: 'desc' }, take: Math.max(1, Math.min(limit, 200)) });
    res.json(logs);
});
router.delete('/tenants/:id/audit-logs', auth_1.requireCsrf, async (req, res) => {
    const actorId = req.user?.id;
    if (!actorId)
        return res.status(401).json({ message: 'Unauthenticated' });
    const id = Number(req.params.id);
    const q = String(req.query.q || '').trim();
    const where = { tenantId: id };
    if (q)
        where.action = { contains: q };
    const result = await prisma_1.prisma.auditLog.deleteMany({ where });
    try {
        await prisma_1.prisma.auditLog.create({
            data: {
                userId: actorId,
                action: 'PROVIDER_TENANT_AUDITLOG_CLEARED',
                entityType: 'Tenant',
                entityId: id,
                tenantId: id,
            },
        });
    }
    catch { }
    res.json({ deleted: result.count });
});
router.put('/tenants/:id/config', async (req, res) => {
    const id = Number(req.params.id);
    const body = req.body || {};
    const t = await prisma_1.prisma.tenant.findUnique({ where: { id } });
    if (!t)
        return res.status(404).json({ message: 'Tenant not found' });
    const cfg = t.config;
    const base = (cfg && typeof cfg === 'object') ? cfg : {};
    const next = { ...base };
    if (body.branding)
        next.branding = { ...(base.branding || {}), ...body.branding };
    if (body.regional)
        next.regional = { ...(base.regional || {}), ...body.regional };
    if (body.features)
        next.features = { ...(base.features || {}), ...body.features };
    const updated = await prisma_1.prisma.tenant.update({ where: { id }, data: { config: next } });
    try {
        await prisma_1.prisma.auditLog.create({ data: { userId: req.user?.id, action: 'PROVIDER_TENANT_CONFIG_UPDATED', entityType: 'Tenant', entityId: id, tenantId: id } });
    }
    catch { }
    res.json(updated);
});
router.post('/tenants', async (req, res) => {
    const { name, slug, status, config, clientId } = req.body;
    if (!name || !slug)
        return res.status(400).json({ message: 'name and slug required' });
    const cleanSlug = String(slug).trim().toLowerCase();
    if (!/^[a-z0-9-]{3,32}$/.test(cleanSlug))
        return res.status(400).json({ message: 'Invalid slug (3–32 chars, letters/numbers/-)' });
    const exists = await prisma_1.prisma.tenant.findUnique({ where: { slug: cleanSlug } });
    if (exists)
        return res.status(409).json({ message: 'Slug already in use' });
    const cfgBase = (config && typeof config === 'object') ? config : {};
    const cfg = clientId ? { ...cfgBase, clientId } : cfgBase;
    const t = await prisma_1.prisma.tenant.create({ data: { name: String(name).trim(), slug: cleanSlug, status: status || 'ACTIVE', config: Object.keys(cfg).length ? cfg : undefined } });
    try {
        await prisma_1.prisma.auditLog.create({ data: { userId: req.user?.id, action: 'PROVIDER_TENANT_CREATED', entityType: 'Tenant', entityId: t.id, tenantId: t.id } });
    }
    catch { }
    res.status(201).json(t);
});
router.put('/tenants/:id', async (req, res) => {
    const id = Number(req.params.id);
    const { name, status, config, slug } = req.body;
    const existing = await prisma_1.prisma.tenant.findUnique({ where: { id } });
    if (!existing)
        return res.status(404).json({ message: 'Tenant not found' });
    let cleanSlug = undefined;
    if (slug !== undefined) {
        cleanSlug = String(slug).trim().toLowerCase();
        if (!/^[a-z0-9-]{3,32}$/.test(cleanSlug))
            return res.status(400).json({ message: 'Invalid slug (3–32 chars, letters/numbers/-)' });
        const conflict = await prisma_1.prisma.tenant.findUnique({ where: { slug: cleanSlug } });
        if (conflict && conflict.id !== id)
            return res.status(409).json({ message: 'Slug already in use' });
    }
    const updated = await prisma_1.prisma.tenant.update({ where: { id }, data: { name: name !== undefined ? String(name).trim() : existing.name, slug: cleanSlug ?? existing.slug, status: status || existing.status, config } });
    try {
        await prisma_1.prisma.auditLog.create({ data: { userId: req.user?.id, action: 'PROVIDER_TENANT_UPDATED', entityType: 'Tenant', entityId: id, tenantId: id } });
    }
    catch { }
    res.json(updated);
});
router.patch('/tenants/:id/archive', async (req, res) => {
    const id = Number(req.params.id);
    const existing = await prisma_1.prisma.tenant.findUnique({ where: { id } });
    if (!existing)
        return res.status(404).json({ message: 'Tenant not found' });
    const now = new Date();
    const updated = await prisma_1.prisma.tenant.update({ where: { id }, data: { archivedAt: now, status: 'ARCHIVED' } });
    try {
        await prisma_1.prisma.auditLog.create({ data: { userId: req.user?.id, action: 'PROVIDER_TENANT_ARCHIVED', entityType: 'Tenant', entityId: id, tenantId: id } });
    }
    catch { }
    res.json(updated);
});
router.patch('/tenants/:id/suspend', async (req, res) => {
    const id = Number(req.params.id);
    const existing = await prisma_1.prisma.tenant.findUnique({ where: { id } });
    if (!existing)
        return res.status(404).json({ message: 'Tenant not found' });
    const updated = await prisma_1.prisma.tenant.update({ where: { id }, data: { status: 'SUSPENDED' } });
    try {
        await prisma_1.prisma.auditLog.create({ data: { userId: req.user?.id, action: 'PROVIDER_TENANT_SUSPENDED', entityType: 'Tenant', entityId: id, tenantId: id } });
    }
    catch { }
    res.json(updated);
});
router.patch('/tenants/:id/activate', async (req, res) => {
    const id = Number(req.params.id);
    const existing = await prisma_1.prisma.tenant.findUnique({ where: { id } });
    if (!existing)
        return res.status(404).json({ message: 'Tenant not found' });
    const updated = await prisma_1.prisma.tenant.update({ where: { id }, data: { status: 'ACTIVE', archivedAt: null } });
    try {
        await prisma_1.prisma.auditLog.create({ data: { userId: req.user?.id, action: 'PROVIDER_TENANT_ACTIVATED', entityType: 'Tenant', entityId: id, tenantId: id } });
    }
    catch { }
    res.json(updated);
});
router.put('/tenants/:id/billing', async (req, res) => {
    const id = Number(req.params.id);
    const { plan, seats, price, renewAt, period, startAt } = req.body;
    const existing = await prisma_1.prisma.tenant.findUnique({ where: { id } });
    if (!existing)
        return res.status(404).json({ message: 'Tenant not found' });
    const cfg = existing.config;
    const base = (cfg && typeof cfg === 'object') ? cfg : {};
    const rates = { basic: 0.4, pro: 1.0, enterprise: 2.0 };
    const months = period === 'yearly' ? 12 : period === 'quarterly' ? 3 : 1;
    const start = startAt ? new Date(startAt) : new Date();
    const calcRenewAt = renewAt ? new Date(renewAt) : new Date(start.getTime());
    calcRenewAt.setMonth(calcRenewAt.getMonth() + months);
    const perSeatRate = rates[String(plan || 'basic').toLowerCase()] ?? rates.basic;
    const computed = (Number(seats || 0) * perSeatRate * months);
    const finalPrice = typeof price === 'number' ? price : computed;
    const newConfig = { ...base, billing: { plan, seats, period, price: finalPrice, priceCalculated: computed, startAt: start.toISOString(), renewAt: calcRenewAt.toISOString() } };
    const updated = await prisma_1.prisma.tenant.update({ where: { id }, data: { config: newConfig } });
    try {
        await prisma_1.prisma.auditLog.create({ data: { userId: req.user?.id, action: 'PROVIDER_TENANT_BILLING_UPDATED', entityType: 'Tenant', entityId: id, tenantId: id } });
    }
    catch { }
    res.json(updated);
});
// Create or reset a default ADMIN for the tenant
router.post('/tenants/:id/bootstrap-admin', async (req, res) => {
    const id = Number(req.params.id);
    const t = await prisma_1.prisma.tenant.findUnique({ where: { id } });
    if (!t)
        return res.status(404).json({ message: 'Tenant not found' });
    const { email, password, name, reset } = (req.body || {});
    const cleanEmail = String(email || `admin@${t.slug}.faithconnect.local`).toLowerCase();
    const tempPassword = String(password || process.env.DEFAULT_TENANT_ADMIN_PASSWORD || 'Admin123!');
    const displayName = String(name || 'Admin');
    const existingAdmin = await prisma_1.prisma.user.findFirst({ where: { role: 'ADMIN', tenantId: id } });
    const hash = await bcryptjs_1.default.hash(tempPassword, 10);
    let user;
    if (!existingAdmin) {
        user = await prisma_1.prisma.user.create({ data: { name: displayName, email: cleanEmail, passwordHash: hash, role: 'ADMIN', tenantId: id } });
        try {
            await prisma_1.prisma.auditLog.create({ data: { userId: req.user?.id, action: 'PROVIDER_TENANT_ADMIN_CREATED', entityType: 'User', entityId: user.id, tenantId: id } });
        }
        catch { }
        return res.status(201).json({ status: 'created', email: cleanEmail, tempPassword });
    }
    if (reset) {
        user = await prisma_1.prisma.user.update({ where: { id: existingAdmin.id }, data: { email: cleanEmail, passwordHash: hash, name: displayName } });
        try {
            await prisma_1.prisma.auditLog.create({ data: { userId: req.user?.id, action: 'PROVIDER_TENANT_ADMIN_RESET', entityType: 'User', entityId: user.id, tenantId: id } });
        }
        catch { }
        return res.json({ status: 'reset', email: cleanEmail, tempPassword });
    }
    return res.status(200).json({ status: 'exists', email: existingAdmin.email });
});
router.get('/maintenance/restart/logs', async (req, res) => {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50)));
    const logs = await prisma_1.prisma.auditLog.findMany({
        where: {
            AND: [{ action: { startsWith: 'PROVIDER_' } }, { action: { contains: 'RESTART' } }],
        },
        orderBy: { timestamp: 'desc' },
        take: limit,
        include: {
            user: { select: { id: true, name: true, email: true, role: true } },
            tenant: { select: { id: true, name: true, slug: true } },
        },
    });
    res.json(logs);
});
router.get('/maintenance/restart/config', async (_req, res) => {
    const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
    const enabled = isRestartEnabled();
    res.json({ enabled, isProd, nodeEnv: String(process.env.NODE_ENV || '').trim() || 'development' });
});
router.get('/maintenance/version', async (req, res) => {
    const actorId = req.user?.id;
    const checkedAt = new Date().toISOString();
    const version = String(process.env.APP_VERSION || '').trim() ||
        String(process.env.BUILD_SHA || '').trim() ||
        'dev';
    const buildTime = String(process.env.BUILD_TIME || '').trim() || null;
    const nodeEnv = String(process.env.NODE_ENV || '').trim() || 'development';
    if (actorId) {
        try {
            await prisma_1.prisma.auditLog.create({
                data: {
                    userId: actorId,
                    action: 'PROVIDER_VERSION_CHECKED',
                    entityType: 'System',
                    entityId: null,
                },
            });
        }
        catch { }
    }
    res.json({ version, buildTime, nodeEnv, checkedAt });
});
router.get('/maintenance/version/status', async (req, res) => {
    const actorId = req.user?.id;
    const checkedAt = new Date().toISOString();
    const version = String(process.env.APP_VERSION || '').trim() ||
        String(process.env.BUILD_SHA || '').trim() ||
        'dev';
    const buildTime = String(process.env.BUILD_TIME || '').trim() || null;
    const nodeEnv = String(process.env.NODE_ENV || '').trim() || 'development';
    const expectedVersion = String(process.env.EXPECTED_APP_VERSION || '').trim() ||
        String(process.env.LATEST_APP_VERSION || '').trim() ||
        null;
    const updateAvailable = !!expectedVersion && expectedVersion !== version;
    const warnings = [];
    if (nodeEnv === 'production' && version === 'dev')
        warnings.push('Production build is missing `APP_VERSION`/`BUILD_SHA`.');
    if (nodeEnv === 'production' && !buildTime)
        warnings.push('Production build is missing `BUILD_TIME`.');
    if (updateAvailable)
        warnings.push(`Expected version is ${expectedVersion}, but current version is ${version}.`);
    if (actorId) {
        try {
            await prisma_1.prisma.auditLog.create({
                data: {
                    userId: actorId,
                    action: 'PROVIDER_VERSION_STATUS_CHECKED',
                    entityType: 'System',
                    entityId: null,
                },
            });
        }
        catch { }
    }
    res.json({
        current: { version, buildTime, nodeEnv, checkedAt },
        expected: { version: expectedVersion },
        updateAvailable,
        warnings,
    });
});
router.post('/maintenance/version/ack', auth_1.requireCsrf, async (req, res) => {
    const actorId = req.user?.id;
    if (!actorId)
        return res.status(401).json({ message: 'Unauthenticated' });
    const at = new Date().toISOString();
    try {
        await prisma_1.prisma.auditLog.create({
            data: {
                userId: actorId,
                action: 'PROVIDER_VERSION_ACKNOWLEDGED',
                entityType: 'System',
                entityId: null,
            },
        });
    }
    catch { }
    res.json({ ok: true, at });
});
router.get('/maintenance/health', async (req, res) => {
    const actorId = req.user?.id;
    const checkedAt = new Date().toISOString();
    const nodeEnv = String(process.env.NODE_ENV || '').trim() || 'development';
    const uptimeSec = Math.floor(process.uptime());
    const memory = process.memoryUsage();
    let dbOk = false;
    let dbError = null;
    try {
        await prisma_1.prisma.user.findFirst({ select: { id: true } });
        dbOk = true;
    }
    catch (e) {
        dbOk = false;
        dbError = String(e?.message || 'DB error');
    }
    if (actorId) {
        try {
            await prisma_1.prisma.auditLog.create({
                data: {
                    userId: actorId,
                    action: 'PROVIDER_HEALTH_CHECKED',
                    entityType: 'System',
                    entityId: null,
                },
            });
        }
        catch { }
    }
    res.json({
        ok: dbOk,
        checkedAt,
        nodeEnv,
        uptimeSec,
        db: { ok: dbOk, error: dbError },
        memory,
    });
});
router.get('/maintenance/version/logs', async (req, res) => {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50)));
    const logs = await prisma_1.prisma.auditLog.findMany({
        where: { action: { startsWith: 'PROVIDER_VERSION_' } },
        orderBy: { timestamp: 'desc' },
        take: limit,
        include: {
            user: { select: { id: true, name: true, email: true, role: true } },
        },
    });
    res.json(logs);
});
router.get('/tenants/:id/config/verify', async (req, res) => {
    const actorId = req.user?.id;
    const id = Number(req.params.id);
    const t = await prisma_1.prisma.tenant.findUnique({ where: { id } });
    if (!t)
        return res.status(404).json({ message: 'Tenant not found' });
    const computedFeatures = (0, features_1.computeTenantFeatures)({ plan: undefined, tenantConfig: t.config });
    const verifiedAt = new Date().toISOString();
    if (actorId) {
        try {
            await prisma_1.prisma.auditLog.create({
                data: {
                    userId: actorId,
                    action: 'PROVIDER_TENANT_CONFIG_VERIFIED',
                    entityType: 'Tenant',
                    entityId: id,
                    tenantId: id,
                },
            });
        }
        catch { }
    }
    res.json({ tenantId: id, config: t.config || null, computedFeatures, verifiedAt });
});
router.get('/maintenance/restart/status/:operationId', async (req, res) => {
    const id = String(req.params.operationId || '').trim();
    if (!id)
        return res.status(400).json({ message: 'operationId required' });
    const op = restartOps.get(id);
    if (!op)
        return res.status(404).json({ message: 'Operation not found' });
    res.json(op);
});
router.post('/maintenance/reauth', auth_1.requireCsrf, async (req, res) => {
    const userJwt = req.user;
    const password = String(req.body?.password || '');
    const otp = String(req.body?.otp || '').trim();
    if (!userJwt?.id)
        return res.status(401).json({ message: 'Unauthenticated' });
    if (userJwt.role !== 'PROVIDER_ADMIN')
        return res.status(403).json({ message: 'Forbidden' });
    if (!password)
        return res.status(400).json({ message: 'Password is required' });
    const user = await prisma_1.prisma.user.findUnique({ where: { id: userJwt.id } });
    if (!user || user.role !== 'PROVIDER_ADMIN')
        return res.status(403).json({ message: 'Forbidden' });
    const ok = await bcryptjs_1.default.compare(password, user.passwordHash);
    if (!ok)
        return res.status(401).json({ message: 'Password is incorrect' });
    if (user.twoFactorEnabled) {
        if (!otp || !user.twoFactorSecret)
            return res.status(401).json({ message: 'Two-factor code required', require2fa: true });
        const verified = otplib_1.authenticator.verify({ token: otp, secret: user.twoFactorSecret });
        if (!verified)
            return res.status(401).json({ message: 'Invalid two-factor code', require2fa: true });
    }
    const reauthToken = jsonwebtoken_1.default.sign({ id: user.id, role: user.role, purpose: 'provider_restart' }, process.env.REAUTH_JWT_SECRET || process.env.JWT_SECRET || 'changeme-super-secret-key', { expiresIn: '5m' });
    res.json({ reauthToken, expiresInSec: 300 });
});
router.post('/maintenance/restart/full', auth_1.requireCsrf, (0, auth_1.requireReauthToken)('provider_restart'), async (req, res) => {
    const actorId = req.user?.id;
    if (!actorId)
        return res.status(401).json({ message: 'Unauthenticated' });
    if (!isRestartEnabled())
        return res.status(403).json({ message: 'Restart is disabled on this server. Set ENABLE_PROVIDER_RESTART=true to allow provider restarts.' });
    try {
        rateLimitOrThrow(actorId, 'restart_full');
    }
    catch (e) {
        const retryAfterSec = Number(e?.retryAfterSec || 600);
        res.setHeader('Retry-After', String(retryAfterSec));
        return res.status(429).json({ message: `Too many restart attempts. Retry in ${retryAfterSec} seconds.` });
    }
    const opId = crypto_1.default.randomUUID();
    restartOps.set(opId, { id: opId, type: 'FULL', tenantId: null, requestedAt: Date.now(), status: 'SCHEDULED' });
    try {
        await prisma_1.prisma.auditLog.create({ data: { userId: actorId, action: 'PROVIDER_SYSTEM_RESTART_REQUESTED', entityType: 'System' } });
    }
    catch { }
    res.status(202).json({ operationId: opId, status: 'scheduled', message: 'Restart scheduled. You will temporarily lose connection.' });
    setTimeout(() => {
        try {
            process.exit(0);
        }
        catch { }
    }, 800);
});
router.post('/maintenance/restart/tenant', auth_1.requireCsrf, (0, auth_1.requireReauthToken)('provider_restart'), async (req, res) => {
    const actorId = req.user?.id;
    if (!actorId)
        return res.status(401).json({ message: 'Unauthenticated' });
    if (!isRestartEnabled())
        return res.status(403).json({ message: 'Restart is disabled on this server. Set ENABLE_PROVIDER_RESTART=true to allow provider restarts.' });
    const tenantId = Number(req.body?.tenantId);
    if (!tenantId || !isFinite(tenantId))
        return res.status(400).json({ message: 'Valid tenantId is required' });
    let tenant = null;
    try {
        tenant = await prisma_1.prisma.tenant.findUnique({ where: { id: tenantId } });
    }
    catch { }
    if (!tenant)
        return res.status(404).json({ message: 'Tenant not found' });
    try {
        rateLimitOrThrow(actorId, `restart_tenant:${tenantId}`);
    }
    catch (e) {
        const retryAfterSec = Number(e?.retryAfterSec || 600);
        res.setHeader('Retry-After', String(retryAfterSec));
        return res.status(429).json({ message: `Too many restart attempts for this tenant. Retry in ${retryAfterSec} seconds.` });
    }
    const opId = crypto_1.default.randomUUID();
    restartOps.set(opId, { id: opId, type: 'TENANT', tenantId, requestedAt: Date.now(), status: 'IN_PROGRESS' });
    try {
        await prisma_1.prisma.auditLog.create({ data: { userId: actorId, action: 'PROVIDER_TENANT_RESTART_REQUESTED', entityType: 'Tenant', entityId: tenantId, tenantId } });
    }
    catch { }
    setTimeout(async () => {
        const op = restartOps.get(opId);
        if (op)
            restartOps.set(opId, { ...op, status: 'COMPLETED' });
        try {
            await prisma_1.prisma.auditLog.create({ data: { userId: actorId, action: 'PROVIDER_TENANT_RESTART_COMPLETED', entityType: 'Tenant', entityId: tenantId, tenantId } });
        }
        catch { }
    }, 800);
    res.status(202).json({ operationId: opId, status: 'in_progress' });
});
exports.default = router;
// Upload branding logo
const uploadsDir = path_1.default.join(__dirname, '../uploads');
const tenantLogosDir = path_1.default.join(uploadsDir, 'tenants');
fs_1.default.mkdirSync(tenantLogosDir, { recursive: true });
const upload = (0, multer_1.default)({ storage: multer_1.default.diskStorage({
        destination: (_req, _file, cb) => {
            cb(null, tenantLogosDir);
        },
        filename: (req, file, cb) => {
            const id = String(req.params.id);
            const ext = path_1.default.extname(file.originalname || '').toLowerCase() || '.png';
            cb(null, `tenant-${id}-logo${ext}`);
        }
    }) });
router.post('/tenants/:id/branding/logo', upload.single('logo'), async (req, res) => {
    const id = Number(req.params.id);
    const t = await prisma_1.prisma.tenant.findUnique({ where: { id } });
    if (!t)
        return res.status(404).json({ message: 'Tenant not found' });
    const file = req.file;
    if (!file)
        return res.status(400).json({ message: 'No file uploaded' });
    const rel = `/uploads/tenants/${file.filename}`;
    const cfg = t.config;
    const base = (cfg && typeof cfg === 'object') ? cfg : {};
    const next = { ...base, branding: { ...(base.branding || {}), logoUrl: rel } };
    const updated = await prisma_1.prisma.tenant.update({ where: { id }, data: { config: next } });
    try {
        await prisma_1.prisma.auditLog.create({ data: { userId: req.user?.id, action: 'PROVIDER_TENANT_LOGO_UPLOADED', entityType: 'Tenant', entityId: id, tenantId: id } });
    }
    catch { }
    res.json({ url: rel, tenant: updated });
});
