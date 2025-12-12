import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import fs from 'fs';
import path from 'path';

const router = Router();
router.use(authenticate);
router.use(requireRole(['PROVIDER_ADMIN']));

router.get('/tenants', async (req, res) => {
  const { q, page, pageSize } = req.query as { q?: string; page?: string; pageSize?: string };
  const take = Math.max(1, Math.min(100, Number(pageSize) || 20));
  const pageNum = Math.max(1, Number(page) || 1);
  const skip = (pageNum - 1) * take;
  const where: any = {};
  if (q) where.OR = [{ name: { contains: String(q), mode: 'insensitive' } }, { slug: { contains: String(q), mode: 'insensitive' } }];
  const [items, total] = await Promise.all([
    prisma.tenant.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.tenant.count({ where }),
  ]);
  res.json({ items, total, page: pageNum, pageSize: take });
});

router.get('/tenants/:id', async (req, res) => {
  const id = Number(req.params.id);
  const t = await prisma.tenant.findUnique({ where: { id } });
  if (!t) return res.status(404).json({ message: 'Tenant not found' });
  res.json(t);
});

router.get('/tenants/:id/audit-logs', async (req, res) => {
  const id = Number(req.params.id);
  const limit = Number(req.query.limit || 50);
  const q = String(req.query.q || '').trim();
  const where: any = { tenantId: id };
  if (q) where.action = { contains: q };
  const logs = await prisma.auditLog.findMany({ where, orderBy: { timestamp: 'desc' }, take: Math.max(1, Math.min(limit, 200)) });
  res.json(logs);
});

router.put('/tenants/:id/config', async (req, res) => {
  const id = Number(req.params.id);
  const body = req.body || {};
  const t = await prisma.tenant.findUnique({ where: { id } });
  if (!t) return res.status(404).json({ message: 'Tenant not found' });
  const cfg = t.config as any;
  const base = (cfg && typeof cfg === 'object') ? cfg : {};
  const next = { ...base } as any;
  if (body.branding) next.branding = { ...(base.branding || {}), ...body.branding };
  if (body.regional) next.regional = { ...(base.regional || {}), ...body.regional };
  if (body.features) next.features = { ...(base.features || {}), ...body.features };
  const updated = await prisma.tenant.update({ where: { id }, data: { config: next } });
  try { await prisma.auditLog.create({ data: { userId: (req as any).user?.id, action: 'TENANT_CONFIG_UPDATED', entityType: 'Tenant', entityId: id, tenant: { connect: { id } } } }); } catch {}
  res.json(updated);
});

router.post('/tenants', async (req, res) => {
  const { name, slug, status, config, clientId } = req.body as { name: string; slug: string; status?: string; config?: any; clientId?: string };
  if (!name || !slug) return res.status(400).json({ message: 'name and slug required' });
  const cleanSlug = String(slug).trim().toLowerCase();
  if (!/^[a-z0-9-]{3,32}$/.test(cleanSlug)) return res.status(400).json({ message: 'Invalid slug (3–32 chars, letters/numbers/-)' });
  const exists = await prisma.tenant.findUnique({ where: { slug: cleanSlug } });
  if (exists) return res.status(409).json({ message: 'Slug already in use' });
  const cfgBase = (config && typeof config === 'object') ? config : {};
  const cfg = clientId ? { ...cfgBase, clientId } : cfgBase;
  const t = await prisma.tenant.create({ data: { name: String(name).trim(), slug: cleanSlug, status: status || 'ACTIVE', config: Object.keys(cfg).length ? cfg : undefined } });
  try { await prisma.auditLog.create({ data: { userId: (req as any).user?.id, action: 'TENANT_CREATED', entityType: 'Tenant', entityId: t.id, tenant: { connect: { id: t.id } } } }); } catch {}
  res.status(201).json(t);
});

router.put('/tenants/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { name, status, config, slug } = req.body as { name?: string; status?: string; config?: any; slug?: string };
  const existing = await prisma.tenant.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ message: 'Tenant not found' });
  let cleanSlug: string | undefined = undefined;
  if (slug !== undefined) {
    cleanSlug = String(slug).trim().toLowerCase();
    if (!/^[a-z0-9-]{3,32}$/.test(cleanSlug)) return res.status(400).json({ message: 'Invalid slug (3–32 chars, letters/numbers/-)' });
    const conflict = await prisma.tenant.findUnique({ where: { slug: cleanSlug } });
    if (conflict && conflict.id !== id) return res.status(409).json({ message: 'Slug already in use' });
  }
  const updated = await prisma.tenant.update({ where: { id }, data: { name: name !== undefined ? String(name).trim() : existing.name, slug: cleanSlug ?? existing.slug, status: status || existing.status, config } });
  try { await prisma.auditLog.create({ data: { userId: (req as any).user?.id, action: 'TENANT_UPDATED', entityType: 'Tenant', entityId: id, tenant: { connect: { id } } } }); } catch {}
  res.json(updated);
});

router.patch('/tenants/:id/archive', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.tenant.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ message: 'Tenant not found' });
  const now = new Date();
  const updated = await prisma.tenant.update({ where: { id }, data: { archivedAt: now, status: 'ARCHIVED' } });
  try { await prisma.auditLog.create({ data: { userId: (req as any).user?.id, action: 'TENANT_ARCHIVED', entityType: 'Tenant', entityId: id, tenant: { connect: { id } } } }); } catch {}
  res.json(updated);
});

router.patch('/tenants/:id/suspend', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.tenant.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ message: 'Tenant not found' });
  const updated = await prisma.tenant.update({ where: { id }, data: { status: 'SUSPENDED' } });
  try { await prisma.auditLog.create({ data: { userId: (req as any).user?.id, action: 'TENANT_SUSPENDED', entityType: 'Tenant', entityId: id, tenant: { connect: { id } } } }); } catch {}
  res.json(updated);
});

router.patch('/tenants/:id/activate', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.tenant.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ message: 'Tenant not found' });
  const updated = await prisma.tenant.update({ where: { id }, data: { status: 'ACTIVE', archivedAt: null } });
  try { await prisma.auditLog.create({ data: { userId: (req as any).user?.id, action: 'TENANT_ACTIVATED', entityType: 'Tenant', entityId: id, tenant: { connect: { id } } } }); } catch {}
  res.json(updated);
});

router.put('/tenants/:id/billing', async (req, res) => {
  const id = Number(req.params.id);
  const { plan, seats, price, renewAt, period, startAt } = req.body as { plan?: string; seats?: number; price?: number; renewAt?: string; period?: 'monthly'|'quarterly'|'yearly'; startAt?: string };
  const existing = await prisma.tenant.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ message: 'Tenant not found' });
  const cfg = existing.config as any;
  const base = (cfg && typeof cfg === 'object') ? cfg : {};
  const rates: Record<string, number> = { basic: 0.4, pro: 1.0, enterprise: 2.0 };
  const months = period === 'yearly' ? 12 : period === 'quarterly' ? 3 : 1;
  const start = startAt ? new Date(startAt) : new Date();
  const calcRenewAt = renewAt ? new Date(renewAt) : new Date(start.getTime());
  calcRenewAt.setMonth(calcRenewAt.getMonth() + months);
  const perSeatRate = rates[String(plan || 'basic').toLowerCase()] ?? rates.basic;
  const computed = (Number(seats || 0) * perSeatRate * months);
  const finalPrice = typeof price === 'number' ? price : computed;
  const newConfig = { ...base, billing: { plan, seats, period, price: finalPrice, priceCalculated: computed, startAt: start.toISOString(), renewAt: calcRenewAt.toISOString() } } as any;
  const updated = await prisma.tenant.update({ where: { id }, data: { config: newConfig } });
  try { await prisma.auditLog.create({ data: { userId: (req as any).user?.id, action: 'TENANT_BILLING_UPDATED', entityType: 'Tenant', entityId: id, tenant: { connect: { id } } } }); } catch {}
  res.json(updated);
});

// Create or reset a default ADMIN for the tenant
router.post('/tenants/:id/bootstrap-admin', async (req, res) => {
  const id = Number(req.params.id);
  const t = await prisma.tenant.findUnique({ where: { id } });
  if (!t) return res.status(404).json({ message: 'Tenant not found' });
  const { email, password, name, reset } = (req.body || {}) as { email?: string; password?: string; name?: string; reset?: boolean };
  const cleanEmail = String(email || `admin@${t.slug}.faithconnect.local`).toLowerCase();
  const tempPassword = String(password || process.env.DEFAULT_TENANT_ADMIN_PASSWORD || 'Admin123!');
  const displayName = String(name || 'Admin');
  const existingAdmin = await prisma.user.findFirst({ where: { role: 'ADMIN', tenantId: id } });
  const hash = await bcrypt.hash(tempPassword, 10);
  let user;
  if (!existingAdmin) {
    user = await prisma.user.create({ data: { name: displayName, email: cleanEmail, passwordHash: hash, role: 'ADMIN', tenantId: id } });
    try { await prisma.auditLog.create({ data: { userId: (req as any).user?.id, action: 'TENANT_ADMIN_CREATED', entityType: 'User', entityId: user.id, tenant: { connect: { id } } } }); } catch {}
    return res.status(201).json({ status: 'created', email: cleanEmail, tempPassword });
  }
  if (reset) {
    user = await prisma.user.update({ where: { id: existingAdmin.id }, data: { email: cleanEmail, passwordHash: hash, name: displayName } });
    try { await prisma.auditLog.create({ data: { userId: (req as any).user?.id, action: 'TENANT_ADMIN_RESET', entityType: 'User', entityId: user.id, tenant: { connect: { id } } } }); } catch {}
    return res.json({ status: 'reset', email: cleanEmail, tempPassword });
  }
  return res.status(200).json({ status: 'exists', email: existingAdmin.email });
});


export default router;
// Upload branding logo
const uploadsDir = path.join(__dirname, '../uploads');
const tenantLogosDir = path.join(uploadsDir, 'tenants');
fs.mkdirSync(tenantLogosDir, { recursive: true });
const upload = multer({ storage: multer.diskStorage({
  destination: (_req: any, _file: any, cb: any) => {
    cb(null, tenantLogosDir);
  },
  filename: (req: any, file: any, cb: any) => {
    const id = String(req.params.id);
    const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
    cb(null, `tenant-${id}-logo${ext}`);
  }
})});

router.post('/tenants/:id/branding/logo', upload.single('logo'), async (req, res) => {
  const id = Number(req.params.id);
  const t = await prisma.tenant.findUnique({ where: { id } });
  if (!t) return res.status(404).json({ message: 'Tenant not found' });
  const file = (req as any).file as any;
  if (!file) return res.status(400).json({ message: 'No file uploaded' });
  const rel = `/uploads/tenants/${file.filename}`;
  const cfg = t.config as any;
  const base = (cfg && typeof cfg === 'object') ? cfg : {};
  const next = { ...base, branding: { ...(base.branding || {}), logoUrl: rel } };
  const updated = await prisma.tenant.update({ where: { id }, data: { config: next } });
  try { await prisma.auditLog.create({ data: { userId: (req as any).user?.id, action: 'TENANT_LOGO_UPLOADED', entityType: 'Tenant', entityId: id, tenant: { connect: { id } } } }); } catch {}
  res.json({ url: rel, tenant: updated });
});
