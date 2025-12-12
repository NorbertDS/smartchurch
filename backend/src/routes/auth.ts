import { Router } from 'express';
import { prisma } from '../config/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticate, requireRole } from '../middleware/auth';
import { tenantContext, requireTenant } from '../middleware/tenant';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';

const router = Router();

router.post('/provider-login', async (req, res) => {
  const { email, password, otp } = req.body as { email: string; password: string; otp?: string };
  if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
  const user = await prisma.user.findFirst({ where: { email: String(email).toLowerCase(), role: 'PROVIDER_ADMIN' } });
  if (!user) return res.status(401).json({ message: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
  const privileged = true;
  if (privileged && user.twoFactorEnabled) {
    if (!otp || !user.twoFactorSecret) return res.status(401).json({ message: 'Two-factor code required', require2fa: true });
    const verified = authenticator.verify({ token: String(otp), secret: user.twoFactorSecret });
    if (!verified) return res.status(401).json({ message: 'Invalid two-factor code', require2fa: true });
  }
  const token = jwt.sign(
    { id: user.id, role: user.role, name: user.name, email: user.email, tenantId: null },
    process.env.JWT_SECRET || 'changeme-super-secret-key',
    { expiresIn: '8h' }
  );
  res.json({ token, role: user.role, name: user.name, twoFactorEnabled: !!user.twoFactorEnabled, tenantId: null });
});

router.post('/login', async (req, res) => {
  const { email, password, otp, tenantSlug } = req.body as { email: string; password: string; otp?: string; tenantSlug?: string };
  if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
  let user: any = null;
  // Allow provider admin login without tenantSlug
  const providerCandidate = await prisma.user.findFirst({ where: { email: String(email).toLowerCase(), role: 'PROVIDER_ADMIN' } });
  if (providerCandidate) {
    user = providerCandidate;
  } else {
    const slug = String(tenantSlug || '').trim().toLowerCase();
    if (slug) {
      const tenant = await prisma.tenant.findUnique({ where: { slug } });
      if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
      user = await prisma.user.findFirst({ where: { email: String(email).toLowerCase(), tenantId: tenant.id } });
    } else {
      // Role-based: allow member login without tenant identifier if email uniquely maps to a MEMBER
      const matches = await prisma.user.findMany({ where: { email: String(email).toLowerCase(), role: 'MEMBER' } });
      if (matches.length === 0) return res.status(401).json({ message: 'Invalid credentials' });
      if (matches.length > 1) return res.status(400).json({ message: 'Multiple accounts found. Specify Church (tenant).' });
      user = matches[0];
    }
  }
  if (!user) return res.status(401).json({ message: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ message: 'Invalid credentials' });

  // Gate member access until approved by admin and ensure linkage exists
  if (user.role === 'MEMBER') {
    const tid = user.tenantId ?? null;
    const where: any = { userId: user.id, deletedAt: null };
    if (tid !== null) where.tenantId = tid;
    const member = await prisma.member.findFirst({ where });
    if (!member) {
      return res.status(403).json({ message: 'No linked member profile found. Contact an administrator.' });
    }
    const status = member.membershipStatus || 'PENDING';
    if (status !== 'APPROVED' && status !== 'ACTIVE') {
      return res.status(403).json({ message: 'Account pending admin approval' });
    }
  }

  // Enforce 2FA for privileged roles if enabled
  const privileged = user.role === 'ADMIN' || user.role === 'CLERK' || user.role === 'PASTOR' || user.role === 'PROVIDER_ADMIN';
  if (privileged && user.twoFactorEnabled) {
    if (!otp || !user.twoFactorSecret) return res.status(401).json({ message: 'Two-factor code required', require2fa: true });
    const verified = authenticator.verify({ token: String(otp), secret: user.twoFactorSecret });
    if (!verified) return res.status(401).json({ message: 'Invalid two-factor code', require2fa: true });
  }

  const token = jwt.sign(
    { id: user.id, role: user.role, name: user.name, email: user.email, tenantId: user.tenantId || null },
    process.env.JWT_SECRET || 'changeme-super-secret-key',
    { expiresIn: '8h' }
  );
  res.json({ token, role: user.role, name: user.name, twoFactorEnabled: !!user.twoFactorEnabled, tenantId: user.tenantId || null });
});

// Public: resolve tenant by name or slug for validation on signup
router.get('/tenant-resolve', async (req, res) => {
  const q = String((req.query as any).q || '').trim();
  if (!q) return res.status(400).json({ message: 'Query required' });
  const slug = q.toLowerCase();
  let t = await prisma.tenant.findUnique({ where: { slug } });
  if (!t) t = await prisma.tenant.findFirst({ where: { name: q } });
  if (!t) t = await prisma.tenant.findFirst({ where: { name: { contains: q } } });
  if (!t) t = await prisma.tenant.findFirst({ where: { slug: { contains: slug } } });
  if (!t) return res.status(404).json({ message: 'Church not found' });
  if (t.status && t.status !== 'ACTIVE') return res.status(400).json({ message: 'Church is not active' });
  res.json({ id: t.id, name: t.name, slug: t.slug });
});

// Admin-only create user
router.post('/register', authenticate, tenantContext, requireRole(['ADMIN']), requireTenant, async (req, res) => {
  const { name, email, password, role } = req.body as { name: string; email: string; password: string; role: 'ADMIN' | 'CLERK' | 'PASTOR' | 'MEMBER' };
  if (!name || !email || !password || !role) return res.status(400).json({ message: 'Missing fields' });
  const tid = (req as any).tenantId as number;
  const exists = await prisma.user.findFirst({ where: { email: String(email).toLowerCase(), tenantId: tid } });
  if (exists) return res.status(409).json({ message: 'Email already in use for this tenant' });
  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { name, email: String(email).toLowerCase(), passwordHash: hash, role, tenantId: tid } });
  res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

// Public member self-registration
router.post('/public-register', tenantContext, requireTenant, async (req, res) => {
  try {
    const { name, email, password, gender, contact, address, demographicGroup, cellGroupId } = req.body as { name: string; email: string; password: string; gender?: 'MALE'|'FEMALE'|'OTHER'; contact?: string; address?: string; demographicGroup?: 'AMM'|'AWM'|'YOUTHS'|'AMBASSADORS'|'CHILDREN'; cellGroupId?: number };
    const cleanName = String(name || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPassword = String(password || '');
    if (!cleanName || !cleanEmail || !cleanPassword) return res.status(400).json({ message: 'Name, email, and password required' });
    const tid = (req as any).tenantId as number;
    const groupId = Number(cellGroupId || 0);
    if (!demographicGroup && !groupId) return res.status(400).json({ message: 'Cell group is required' });
    if (demographicGroup) {
      const allowed = ['AMM','AWM','YOUTHS','AMBASSADORS','CHILDREN'];
      if (!allowed.includes(demographicGroup)) return res.status(400).json({ message: 'Invalid demographic group' });
    }
    if (groupId) {
      const existingGroup = await prisma.cellGroup.findFirst({ where: { id: groupId, tenantId: tid } });
      if (!existingGroup) return res.status(400).json({ message: 'Invalid cell group' });
    }
    const exists = await prisma.user.findFirst({ where: { email: cleanEmail, tenantId: tid } });
    if (exists) return res.status(409).json({ message: 'Email already in use for this tenant' });
    const hash = await bcrypt.hash(cleanPassword, 10);
    const user = await prisma.user.create({ data: { name: cleanName, email: cleanEmail, passwordHash: hash, role: 'MEMBER', tenantId: tid } });
    const [firstName, ...rest] = cleanName.split(' ');
    const lastName = rest.join(' ') || firstName;
    const member = await prisma.member.create({ data: { firstName, lastName, gender: gender || 'OTHER', demographicGroup: demographicGroup || null, contact: contact || undefined, address: address || undefined, userId: user.id, spiritualStatus: 'New Convert', membershipStatus: 'PENDING', tenantId: tid } });
    if (groupId) {
      await prisma.cellGroupMembership.create({ data: { groupId, memberId: member.id, registeredById: user.id, tenantId: tid } });
    }
    // Do not auto-login; require admin approval before access
    res.status(201).json({ status: 'pending_approval', message: 'Registration submitted. Awaiting admin approval.' });
  } catch (e: any) {
    const message = e?.message || 'Registration failed';
    res.status(500).json({ message });
  }
});

// List users (Admin and Clerk)
router.get('/users', authenticate, tenantContext, requireRole(['ADMIN','CLERK']), requireTenant, async (req, res) => {
  const tid = (req as any).tenantId as number;
  const users = await prisma.user.findMany({ where: { tenantId: tid }, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, email: true, role: true, createdAt: true } });
  res.json(users);
});

// Update user role (Admin only)
router.put('/users/:id/role', authenticate, tenantContext, requireRole(['ADMIN']), requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const { role } = req.body as { role: 'ADMIN' | 'CLERK' | 'PASTOR' | 'MEMBER' };
  const tid = (req as any).tenantId as number;
  const user = await prisma.user.findFirst({ where: { id, tenantId: tid } });
  if (!user) return res.status(404).json({ message: 'User not found' });
  const updated = await prisma.user.update({ where: { id }, data: { role } });
  res.json({ id: updated.id, role: updated.role });
});

// Delete user (Admin only)
router.delete('/users/:id', authenticate, tenantContext, requireRole(['ADMIN']), requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const actor = (req as any).user;
  if (actor?.id === id) return res.status(400).json({ message: 'You cannot delete your own account' });
  const tid = (req as any).tenantId as number;
  const user = await prisma.user.findFirst({ where: { id, tenantId: tid } });
  if (!user) return res.status(404).json({ message: 'User not found' });
  await prisma.user.delete({ where: { id } });
  res.status(204).end();
});

// Self password change
router.patch('/me/password', authenticate, tenantContext, requireTenant, async (req, res) => {
  const userJwt = (req as any).user;
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
  if (!currentPassword || !newPassword) return res.status(400).json({ message: 'Current and new password required' });
  const tid = (req as any).tenantId as number;
  const user = await prisma.user.findFirst({ where: { id: userJwt.id, tenantId: tid } });
  if (!user) return res.status(404).json({ message: 'User not found' });
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) return res.status(401).json({ message: 'Current password is incorrect' });
  const hash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } });
  res.json({ status: 'password_updated' });
});

// Admin/Clerk reset any user password
router.patch('/users/:id/password', authenticate, tenantContext, requireRole(['ADMIN','CLERK']), requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const { newPassword } = req.body as { newPassword: string };
  if (!newPassword) return res.status(400).json({ message: 'New password required' });
  const tid = (req as any).tenantId as number;
  const user = await prisma.user.findFirst({ where: { id, tenantId: tid } });
  if (!user) return res.status(404).json({ message: 'User not found' });
  const hash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id }, data: { passwordHash: hash } });
  res.json({ status: 'password_reset', id });
});

export default router;
// Bootstrap admin only if none exists; intended for first-time setup
router.post('/bootstrap-admin', async (req, res) => {
  const count = await prisma.user.count({ where: { role: 'ADMIN' } });
  if (count > 0) return res.status(400).json({ message: 'Admin already exists' });
  const { email, password, name } = req.body as { email: string; password: string; name?: string };
  if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
  const exists = await prisma.user.findFirst({ where: { email } });
  if (exists) return res.status(409).json({ message: 'Email already in use' });
  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { name: name || 'Admin', email, passwordHash: hash, role: 'ADMIN' } });
  return res.status(201).json({ id: user.id, email: user.email });
});

// Dev-only: create an additional admin using a simple header passcode
router.post('/create-admin', async (req, res) => {
  const pass = String(req.headers['x-admin-bootstrap'] || '');
  if (pass !== 'faithconnect-dev') return res.status(403).json({ message: 'Forbidden' });
  const { email, password, name } = req.body as { email: string; password: string; name?: string };
  if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
  const exists = await prisma.user.findFirst({ where: { email } });
  if (exists) return res.status(409).json({ message: 'Email already in use' });
  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { name: name || 'Admin', email, passwordHash: hash, role: 'ADMIN' } });
  return res.status(201).json({ id: user.id, email: user.email });
});

// Dev-only: create provider admin using a simple header passcode
router.post('/create-provider-admin', async (req, res) => {
  const pass = String(req.headers['x-admin-bootstrap'] || '');
  if (pass !== 'faithconnect-dev') return res.status(403).json({ message: 'Forbidden' });
  const { email, password, name } = req.body as { email: string; password: string; name?: string };
  if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
  const cleanEmail = String(email).toLowerCase();
  const exists = await prisma.user.findFirst({ where: { email: cleanEmail, role: 'PROVIDER_ADMIN' } });
  if (exists) return res.status(409).json({ message: 'Provider admin already exists with this email' });
  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { name: name || 'Provider Admin', email: cleanEmail, passwordHash: hash, role: 'PROVIDER_ADMIN' } });
  return res.status(201).json({ id: user.id, email: user.email });
});

// Dev-only: bootstrap provider admin with default env or fallback
router.post('/provider-bootstrap-dev', async (req, res) => {
  const pass = String(req.headers['x-admin-bootstrap'] || '');
  if (pass !== 'faithconnect-dev') return res.status(403).json({ message: 'Forbidden' });
  const email = String(process.env.PROVIDER_ADMIN_EMAIL || 'provider.admin@faithconnect.local').toLowerCase();
  const password = String(process.env.PROVIDER_ADMIN_PASSWORD || 'ProviderAdmin123!');
  const name = String(process.env.PROVIDER_ADMIN_NAME || 'Provider Admin');
  const exists = await prisma.user.findFirst({ where: { email, role: 'PROVIDER_ADMIN' } });
  if (exists) return res.status(200).json({ status: 'exists', id: exists.id, email: exists.email });
  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { name, email, passwordHash: hash, role: 'PROVIDER_ADMIN' } });
  return res.status(201).json({ status: 'created', id: user.id, email: user.email });
});

// Dev-only: reset provider admin password to env default
router.post('/provider-reset-dev', async (req, res) => {
  const pass = String(req.headers['x-admin-bootstrap'] || '');
  if (pass !== 'faithconnect-dev') return res.status(403).json({ message: 'Forbidden' });
  const email = String(process.env.PROVIDER_ADMIN_EMAIL || 'provider.admin@faithconnect.local').toLowerCase();
  const password = String(process.env.PROVIDER_ADMIN_PASSWORD || 'ProviderAdmin123!');
  const user = await prisma.user.findFirst({ where: { email, role: 'PROVIDER_ADMIN' } });
  const hash = await bcrypt.hash(password, 10);
  if (!user) {
    const name = String(process.env.PROVIDER_ADMIN_NAME || 'Provider Admin');
    const created = await prisma.user.create({ data: { name, email, passwordHash: hash, role: 'PROVIDER_ADMIN' } });
    return res.status(201).json({ status: 'created', id: created.id, email: created.email });
  }
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } });
  return res.status(200).json({ status: 'reset', id: user.id, email: user.email });
});

// Setup 2FA: generate secret and otpauth uri for authenticator apps
router.post('/setup-2fa', authenticate, requireRole(['ADMIN','CLERK','PASTOR']), async (req, res) => {
  const userJwt = (req as any).user;
  const user = await prisma.user.findUnique({ where: { id: userJwt.id } });
  if (!user) return res.status(404).json({ message: 'User not found' });
  const secret = authenticator.generateSecret();
  const label = encodeURIComponent(`FaithConnect:${user.email}`);
  const issuer = encodeURIComponent('FaithConnect');
  const otpauth = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}`;
  const qrDataUrl = await QRCode.toDataURL(otpauth);
  // Store secret temporarily; enable only after verify
  await prisma.user.update({ where: { id: user.id }, data: { twoFactorSecret: secret } });
  res.json({ otpauth, qrDataUrl });
});

// Verify 2FA code to enable 2FA
router.post('/verify-2fa', authenticate, requireRole(['ADMIN','CLERK','PASTOR']), async (req, res) => {
  const userJwt = (req as any).user;
  const { otp } = req.body as { otp: string };
  if (!otp) return res.status(400).json({ message: 'otp required' });
  const user = await prisma.user.findUnique({ where: { id: userJwt.id } });
  if (!user || !user.twoFactorSecret) return res.status(400).json({ message: '2FA not initialized' });
  const ok = authenticator.verify({ token: String(otp), secret: user.twoFactorSecret });
  if (!ok) return res.status(401).json({ message: 'Invalid code' });
  await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true } });
  res.json({ status: '2fa_enabled' });
});

// Disable 2FA (requires otp)
router.post('/disable-2fa', authenticate, requireRole(['ADMIN','CLERK','PASTOR']), async (req, res) => {
  const userJwt = (req as any).user;
  const { otp } = req.body as { otp: string };
  const user = await prisma.user.findUnique({ where: { id: userJwt.id } });
  if (!user || !user.twoFactorSecret) return res.status(400).json({ message: '2FA not enabled' });
  const ok = authenticator.verify({ token: String(otp), secret: user.twoFactorSecret });
  if (!ok) return res.status(401).json({ message: 'Invalid code' });
  await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: false, twoFactorSecret: null } });
  res.json({ status: '2fa_disabled' });
});
// Public: list cell groups for a Church (tenant)
router.get('/public-cell-groups', tenantContext, requireTenant, async (req, res) => {
  const tid = (req as any).tenantId as number;
  // Seed minimal defaults when empty
  const count = await prisma.cellGroup.count({ where: { tenantId: tid } });
  if (count === 0) {
    const names = ['Area 1','Area 2','Area 3','Area 4'];
    await prisma.cellGroup.createMany({ data: names.map(n => ({ name: n, tenantId: tid })) });
  }
  const q = String(req.query.q || '').trim();
  const where = q ? { tenantId: tid, OR: [{ name: { contains: q } }, { location: { contains: q } }] } : { tenantId: tid };
  const groups = await prisma.cellGroup.findMany({ where, orderBy: { name: 'asc' } });
  res.json(groups);
});
