"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../config/prisma");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const otplib_1 = require("otplib");
const qrcode_1 = __importDefault(require("qrcode"));
const email_1 = require("../services/email");
const router = (0, express_1.Router)();
async function upsertDashboardSnapshot(tenantId, patch) {
    const key = 'dashboard_snapshot';
    const existing = await prisma_1.prisma.setting.findUnique({ where: { tenantId_key: { tenantId, key } } });
    let prev = {};
    try {
        prev = existing ? JSON.parse(existing.value) : {};
    }
    catch {
        prev = {};
    }
    const next = { ...(prev && typeof prev === 'object' ? prev : {}), ...patch, updatedAt: new Date().toISOString() };
    const value = JSON.stringify(next);
    if (existing)
        await prisma_1.prisma.setting.update({ where: { id: existing.id }, data: { value } });
    else
        await prisma_1.prisma.setting.create({ data: { tenantId, key, value } });
}
router.post('/provider-login', async (req, res) => {
    const { email, password, otp } = req.body;
    if (!email || !password)
        return res.status(400).json({ message: 'Email and password required' });
    const user = await prisma_1.prisma.user.findFirst({ where: { email: String(email).toLowerCase(), role: 'PROVIDER_ADMIN' } });
    if (!user)
        return res.status(401).json({ message: 'Invalid credentials' });
    const ok = await bcryptjs_1.default.compare(password, user.passwordHash);
    if (!ok)
        return res.status(401).json({ message: 'Invalid credentials' });
    const privileged = true;
    if (privileged && user.twoFactorEnabled) {
        if (!otp || !user.twoFactorSecret)
            return res.status(401).json({ message: 'Two-factor code required', require2fa: true });
        const verified = otplib_1.authenticator.verify({ token: String(otp), secret: user.twoFactorSecret });
        if (!verified)
            return res.status(401).json({ message: 'Invalid two-factor code', require2fa: true });
    }
    const token = jsonwebtoken_1.default.sign({ id: user.id, role: user.role, name: user.name, email: user.email, tenantId: null }, process.env.JWT_SECRET || 'changeme-super-secret-key', { expiresIn: '8h' });
    const csrfToken = (0, auth_1.signCsrfTokenForJwt)(token);
    res.json({ token, csrfToken, role: user.role, name: user.name, twoFactorEnabled: !!user.twoFactorEnabled, tenantId: null });
});
router.post('/provider-forgot-password', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email)
        return res.status(400).json({ message: 'Email is required' });
    const user = await prisma_1.prisma.user.findFirst({ where: { email, role: 'PROVIDER_ADMIN' } });
    if (!user)
        return res.json({ status: 'ok' });
    const rawToken = crypto_1.default.randomBytes(32).toString('hex');
    const tokenHash = crypto_1.default.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await prisma_1.prisma.user.update({
        where: { id: user.id },
        data: { resetTokenHash: tokenHash, resetTokenExpiresAt: expiresAt },
    });
    const baseUrl = String(process.env.FRONTEND_URL || process.env.APP_BASE_URL || 'http://localhost:5173').replace(/\/+$/, '');
    const resetUrl = `${baseUrl}/provider/reset?token=${encodeURIComponent(rawToken)}`;
    const subject = 'FaithConnect: Provider password reset';
    const text = `A password reset was requested for your provider account.\n\nReset link (valid for 30 minutes):\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`;
    await (0, email_1.sendEmail)({ to: user.email, subject, text });
    const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
    if (!isProd && !process.env.SMTP_HOST) {
        return res.json({ status: 'ok', resetUrl });
    }
    return res.json({ status: 'ok' });
});
router.post('/provider-reset-password', async (req, res) => {
    const token = String(req.body?.token || '').trim();
    const newPassword = String(req.body?.newPassword || '');
    if (!token || !newPassword)
        return res.status(400).json({ message: 'token and newPassword are required' });
    if (newPassword.length < 8)
        return res.status(400).json({ message: 'Password must be at least 8 characters' });
    const tokenHash = crypto_1.default.createHash('sha256').update(token).digest('hex');
    const user = await prisma_1.prisma.user.findFirst({
        where: {
            role: 'PROVIDER_ADMIN',
            resetTokenHash: tokenHash,
            resetTokenExpiresAt: { gt: new Date() },
        },
    });
    if (!user)
        return res.status(400).json({ message: 'Invalid or expired reset token' });
    const passwordHash = await bcryptjs_1.default.hash(newPassword, 10);
    await prisma_1.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, resetTokenHash: null, resetTokenExpiresAt: null },
    });
    return res.json({ status: 'password_reset' });
});
router.post('/login', async (req, res) => {
    const { email, password, otp, tenantSlug } = req.body;
    if (!email || !password)
        return res.status(400).json({ message: 'Email and password required' });
    let user = null;
    // Allow provider admin login without tenantSlug
    const providerCandidate = await prisma_1.prisma.user.findFirst({ where: { email: String(email).toLowerCase(), role: 'PROVIDER_ADMIN' } });
    if (providerCandidate) {
        user = providerCandidate;
    }
    else {
        const slug = String(tenantSlug || '').trim().toLowerCase();
        if (slug) {
            const tenant = await prisma_1.prisma.tenant.findUnique({ where: { slug } });
            if (!tenant)
                return res.status(404).json({ message: 'Tenant not found' });
            user = await prisma_1.prisma.user.findFirst({ where: { email: String(email).toLowerCase(), tenantId: tenant.id } });
        }
        else {
            // Role-based: allow member login without tenant identifier if email uniquely maps to a MEMBER
            const matches = await prisma_1.prisma.user.findMany({ where: { email: String(email).toLowerCase(), role: 'MEMBER' } });
            if (matches.length === 0)
                return res.status(401).json({ message: 'Invalid credentials' });
            if (matches.length > 1)
                return res.status(400).json({ message: 'Multiple accounts found. Specify Church (tenant).' });
            user = matches[0];
        }
    }
    if (!user)
        return res.status(401).json({ message: 'Invalid credentials' });
    const ok = await bcryptjs_1.default.compare(password, user.passwordHash);
    if (!ok)
        return res.status(401).json({ message: 'Invalid credentials' });
    // Gate member access until approved by admin and ensure linkage exists
    if (user.role === 'MEMBER') {
        const tid = user.tenantId ?? null;
        const where = { userId: user.id, deletedAt: null };
        if (tid !== null)
            where.tenantId = tid;
        const member = await prisma_1.prisma.member.findFirst({ where });
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
        if (!otp || !user.twoFactorSecret)
            return res.status(401).json({ message: 'Two-factor code required', require2fa: true });
        const verified = otplib_1.authenticator.verify({ token: String(otp), secret: user.twoFactorSecret });
        if (!verified)
            return res.status(401).json({ message: 'Invalid two-factor code', require2fa: true });
    }
    const token = jsonwebtoken_1.default.sign({ id: user.id, role: user.role, name: user.name, email: user.email, tenantId: user.tenantId || null }, process.env.JWT_SECRET || 'changeme-super-secret-key', { expiresIn: '8h' });
    const csrfToken = (0, auth_1.signCsrfTokenForJwt)(token);
    res.json({ token, csrfToken, role: user.role, name: user.name, twoFactorEnabled: !!user.twoFactorEnabled, tenantId: user.tenantId || null });
});
// Public: resolve tenant by name or slug for validation on signup
router.get('/tenant-resolve', async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q)
        return res.status(400).json({ message: 'Query required' });
    const slug = q.toLowerCase();
    let t = await prisma_1.prisma.tenant.findUnique({ where: { slug } });
    if (!t)
        t = await prisma_1.prisma.tenant.findFirst({ where: { name: q } });
    if (!t)
        t = await prisma_1.prisma.tenant.findFirst({ where: { name: { contains: q } } });
    if (!t)
        t = await prisma_1.prisma.tenant.findFirst({ where: { slug: { contains: slug } } });
    if (!t)
        return res.status(404).json({ message: 'Church not found' });
    if (t.status && t.status !== 'ACTIVE')
        return res.status(400).json({ message: 'Church is not active' });
    res.json({ id: t.id, name: t.name, slug: t.slug });
});
// Admin-only create user
router.post('/register', auth_1.authenticate, tenant_1.tenantContext, (0, auth_1.requireRole)(['ADMIN']), tenant_1.requireTenant, async (req, res) => {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role)
        return res.status(400).json({ message: 'Missing fields' });
    const tid = req.tenantId;
    const exists = await prisma_1.prisma.user.findFirst({ where: { email: String(email).toLowerCase(), tenantId: tid } });
    if (exists)
        return res.status(409).json({ message: 'Email already in use for this tenant' });
    const hash = await bcryptjs_1.default.hash(password, 10);
    const user = await prisma_1.prisma.user.create({ data: { name, email: String(email).toLowerCase(), passwordHash: hash, role, tenantId: tid } });
    res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role });
});
// Public member self-registration
router.post('/public-register', tenant_1.tenantContext, tenant_1.requireTenant, async (req, res) => {
    try {
        const { name, email, password, gender, contact, address, demographicGroup, cellGroupId } = req.body;
        const cleanName = String(name || '').trim();
        const cleanEmail = String(email || '').trim().toLowerCase();
        const cleanPassword = String(password || '');
        if (!cleanName || !cleanEmail || !cleanPassword)
            return res.status(400).json({ message: 'Name, email, and password required' });
        const tid = req.tenantId;
        const groupId = Number(cellGroupId || 0);
        if (!demographicGroup && !groupId)
            return res.status(400).json({ message: 'Cell group is required' });
        if (demographicGroup) {
            const allowed = ['AMM', 'AWM', 'YOUTHS', 'AMBASSADORS', 'CHILDREN'];
            if (!allowed.includes(demographicGroup))
                return res.status(400).json({ message: 'Invalid demographic group' });
        }
        if (groupId) {
            const existingGroup = await prisma_1.prisma.cellGroup.findFirst({ where: { id: groupId, tenantId: tid } });
            if (!existingGroup)
                return res.status(400).json({ message: 'Invalid cell group' });
        }
        const exists = await prisma_1.prisma.user.findFirst({ where: { email: cleanEmail, tenantId: tid } });
        if (exists)
            return res.status(409).json({ message: 'Email already in use for this tenant' });
        const hash = await bcryptjs_1.default.hash(cleanPassword, 10);
        const user = await prisma_1.prisma.user.create({ data: { name: cleanName, email: cleanEmail, passwordHash: hash, role: 'MEMBER', tenantId: tid } });
        const [firstName, ...rest] = cleanName.split(' ');
        const lastName = rest.join(' ') || firstName;
        const member = await prisma_1.prisma.member.create({ data: { firstName, lastName, gender: gender || 'OTHER', demographicGroup: demographicGroup || null, contact: contact || undefined, address: address || undefined, userId: user.id, spiritualStatus: 'New Convert', membershipStatus: 'PENDING', tenantId: tid } });
        if (groupId) {
            await prisma_1.prisma.cellGroupMembership.create({ data: { groupId, memberId: member.id, registeredById: user.id, tenantId: tid } });
        }
        // Do not auto-login; require admin approval before access
        res.status(201).json({ status: 'pending_approval', message: 'Registration submitted. Awaiting admin approval.' });
    }
    catch (e) {
        const message = e?.message || 'Registration failed';
        res.status(500).json({ message });
    }
});
// List users (Admin and Clerk)
router.get('/users', auth_1.authenticate, tenant_1.tenantContext, (0, auth_1.requireRole)(['ADMIN', 'CLERK']), tenant_1.requireTenant, async (req, res) => {
    const tid = req.tenantId;
    const users = await prisma_1.prisma.user.findMany({ where: { tenantId: tid }, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, email: true, role: true, createdAt: true } });
    res.json(users);
});
// Update user role (Admin only)
router.put('/users/:id/role', auth_1.authenticate, tenant_1.tenantContext, (0, auth_1.requireRole)(['ADMIN']), tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const { role } = req.body;
    const tid = req.tenantId;
    const user = await prisma_1.prisma.user.findFirst({ where: { id, tenantId: tid } });
    if (!user)
        return res.status(404).json({ message: 'User not found' });
    const updated = await prisma_1.prisma.user.update({ where: { id }, data: { role } });
    (0, auth_1.invalidateUserAuthCache)(id);
    try {
        const staffUsers = await prisma_1.prisma.user.count({ where: { tenantId: tid, role: { in: ['ADMIN', 'CLERK', 'PASTOR'] } } });
        await upsertDashboardSnapshot(tid, { staffUsers, lastUserRoleChangeAt: new Date().toISOString() });
        await prisma_1.prisma.auditLog.create({ data: { userId: req.user?.id, action: 'USER_ROLE_UPDATED', entityType: 'User', entityId: id, tenantId: tid } });
    }
    catch { }
    res.json({ id: updated.id, role: updated.role });
});
// Delete user (Admin only)
router.delete('/users/:id', auth_1.authenticate, tenant_1.tenantContext, (0, auth_1.requireRole)(['ADMIN']), tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const actor = req.user;
    if (actor?.id === id)
        return res.status(400).json({ message: 'You cannot delete your own account' });
    const tid = req.tenantId;
    const user = await prisma_1.prisma.user.findFirst({ where: { id, tenantId: tid } });
    if (!user)
        return res.status(404).json({ message: 'User not found' });
    await prisma_1.prisma.user.delete({ where: { id } });
    (0, auth_1.invalidateUserAuthCache)(id);
    try {
        const staffUsers = await prisma_1.prisma.user.count({ where: { tenantId: tid, role: { in: ['ADMIN', 'CLERK', 'PASTOR'] } } });
        await upsertDashboardSnapshot(tid, { staffUsers, lastUserDeleteAt: new Date().toISOString() });
        await prisma_1.prisma.auditLog.create({ data: { userId: actor?.id, action: 'USER_DELETED', entityType: 'User', entityId: id, tenantId: tid } });
    }
    catch { }
    res.status(204).end();
});
// Self password change
router.patch('/me/password', auth_1.authenticate, tenant_1.tenantContext, tenant_1.requireTenant, async (req, res) => {
    const userJwt = req.user;
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
        return res.status(400).json({ message: 'Current and new password required' });
    const tid = req.tenantId;
    const user = await prisma_1.prisma.user.findFirst({ where: { id: userJwt.id, tenantId: tid } });
    if (!user)
        return res.status(404).json({ message: 'User not found' });
    const ok = await bcryptjs_1.default.compare(currentPassword, user.passwordHash);
    if (!ok)
        return res.status(401).json({ message: 'Current password is incorrect' });
    const hash = await bcryptjs_1.default.hash(newPassword, 10);
    await prisma_1.prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } });
    res.json({ status: 'password_updated' });
});
// Admin/Clerk reset any user password
router.patch('/users/:id/password', auth_1.authenticate, tenant_1.tenantContext, (0, auth_1.requireRole)(['ADMIN', 'CLERK']), tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const { newPassword } = req.body;
    if (!newPassword)
        return res.status(400).json({ message: 'New password required' });
    const tid = req.tenantId;
    const user = await prisma_1.prisma.user.findFirst({ where: { id, tenantId: tid } });
    if (!user)
        return res.status(404).json({ message: 'User not found' });
    const hash = await bcryptjs_1.default.hash(newPassword, 10);
    await prisma_1.prisma.user.update({ where: { id }, data: { passwordHash: hash } });
    res.json({ status: 'password_reset', id });
});
exports.default = router;
// Bootstrap admin only if none exists; intended for first-time setup
router.post('/bootstrap-admin', async (req, res) => {
    const count = await prisma_1.prisma.user.count({ where: { role: 'ADMIN' } });
    if (count > 0)
        return res.status(400).json({ message: 'Admin already exists' });
    const { email, password, name } = req.body;
    if (!email || !password)
        return res.status(400).json({ message: 'Email and password required' });
    const exists = await prisma_1.prisma.user.findFirst({ where: { email } });
    if (exists)
        return res.status(409).json({ message: 'Email already in use' });
    const hash = await bcryptjs_1.default.hash(password, 10);
    const user = await prisma_1.prisma.user.create({ data: { name: name || 'Admin', email, passwordHash: hash, role: 'ADMIN' } });
    return res.status(201).json({ id: user.id, email: user.email });
});
// Dev-only: create an additional admin using a simple header passcode
router.post('/create-admin', async (req, res) => {
    const pass = String(req.headers['x-admin-bootstrap'] || '');
    if (pass !== 'faithconnect-dev')
        return res.status(403).json({ message: 'Forbidden' });
    const { email, password, name } = req.body;
    if (!email || !password)
        return res.status(400).json({ message: 'Email and password required' });
    const exists = await prisma_1.prisma.user.findFirst({ where: { email } });
    if (exists)
        return res.status(409).json({ message: 'Email already in use' });
    const hash = await bcryptjs_1.default.hash(password, 10);
    const user = await prisma_1.prisma.user.create({ data: { name: name || 'Admin', email, passwordHash: hash, role: 'ADMIN' } });
    return res.status(201).json({ id: user.id, email: user.email });
});
// Dev-only: create provider admin using a simple header passcode
router.post('/create-provider-admin', async (req, res) => {
    const pass = String(req.headers['x-admin-bootstrap'] || '');
    if (pass !== 'faithconnect-dev')
        return res.status(403).json({ message: 'Forbidden' });
    const { email, password, name } = req.body;
    if (!email || !password)
        return res.status(400).json({ message: 'Email and password required' });
    const cleanEmail = String(email).toLowerCase();
    const exists = await prisma_1.prisma.user.findFirst({ where: { email: cleanEmail, role: 'PROVIDER_ADMIN' } });
    if (exists)
        return res.status(409).json({ message: 'Provider admin already exists with this email' });
    const hash = await bcryptjs_1.default.hash(password, 10);
    const user = await prisma_1.prisma.user.create({ data: { name: name || 'Provider Admin', email: cleanEmail, passwordHash: hash, role: 'PROVIDER_ADMIN' } });
    return res.status(201).json({ id: user.id, email: user.email });
});
// Dev-only: bootstrap provider admin with default env or fallback
router.post('/provider-bootstrap-dev', async (req, res) => {
    const pass = String(req.headers['x-admin-bootstrap'] || '');
    if (pass !== 'faithconnect-dev')
        return res.status(403).json({ message: 'Forbidden' });
    const email = String(process.env.PROVIDER_ADMIN_EMAIL || 'provider.admin@faithconnect.local').toLowerCase();
    const password = String(process.env.PROVIDER_ADMIN_PASSWORD || 'ProviderAdmin123!');
    const name = String(process.env.PROVIDER_ADMIN_NAME || 'Provider Admin');
    const exists = await prisma_1.prisma.user.findFirst({ where: { email, role: 'PROVIDER_ADMIN' } });
    if (exists)
        return res.status(200).json({ status: 'exists', id: exists.id, email: exists.email });
    const hash = await bcryptjs_1.default.hash(password, 10);
    const user = await prisma_1.prisma.user.create({ data: { name, email, passwordHash: hash, role: 'PROVIDER_ADMIN' } });
    return res.status(201).json({ status: 'created', id: user.id, email: user.email });
});
// Dev-only: reset provider admin password to env default
router.post('/provider-reset-dev', async (req, res) => {
    const pass = String(req.headers['x-admin-bootstrap'] || '');
    if (pass !== 'faithconnect-dev')
        return res.status(403).json({ message: 'Forbidden' });
    const email = String(process.env.PROVIDER_ADMIN_EMAIL || 'provider.admin@faithconnect.local').toLowerCase();
    const password = String(process.env.PROVIDER_ADMIN_PASSWORD || 'ProviderAdmin123!');
    const user = await prisma_1.prisma.user.findFirst({ where: { email, role: 'PROVIDER_ADMIN' } });
    const hash = await bcryptjs_1.default.hash(password, 10);
    if (!user) {
        const name = String(process.env.PROVIDER_ADMIN_NAME || 'Provider Admin');
        const created = await prisma_1.prisma.user.create({ data: { name, email, passwordHash: hash, role: 'PROVIDER_ADMIN' } });
        return res.status(201).json({ status: 'created', id: created.id, email: created.email });
    }
    await prisma_1.prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } });
    return res.status(200).json({ status: 'reset', id: user.id, email: user.email });
});
// Setup 2FA: generate secret and otpauth uri for authenticator apps
router.post('/setup-2fa', auth_1.authenticate, (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), async (req, res) => {
    const userJwt = req.user;
    const user = await prisma_1.prisma.user.findUnique({ where: { id: userJwt.id } });
    if (!user)
        return res.status(404).json({ message: 'User not found' });
    const secret = otplib_1.authenticator.generateSecret();
    const label = encodeURIComponent(`FaithConnect:${user.email}`);
    const issuer = encodeURIComponent('FaithConnect');
    const otpauth = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}`;
    const qrDataUrl = await qrcode_1.default.toDataURL(otpauth);
    // Store secret temporarily; enable only after verify
    await prisma_1.prisma.user.update({ where: { id: user.id }, data: { twoFactorSecret: secret } });
    res.json({ otpauth, qrDataUrl });
});
// Verify 2FA code to enable 2FA
router.post('/verify-2fa', auth_1.authenticate, (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), async (req, res) => {
    const userJwt = req.user;
    const { otp } = req.body;
    if (!otp)
        return res.status(400).json({ message: 'otp required' });
    const user = await prisma_1.prisma.user.findUnique({ where: { id: userJwt.id } });
    if (!user || !user.twoFactorSecret)
        return res.status(400).json({ message: '2FA not initialized' });
    const ok = otplib_1.authenticator.verify({ token: String(otp), secret: user.twoFactorSecret });
    if (!ok)
        return res.status(401).json({ message: 'Invalid code' });
    await prisma_1.prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true } });
    res.json({ status: '2fa_enabled' });
});
// Disable 2FA (requires otp)
router.post('/disable-2fa', auth_1.authenticate, (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), async (req, res) => {
    const userJwt = req.user;
    const { otp } = req.body;
    const user = await prisma_1.prisma.user.findUnique({ where: { id: userJwt.id } });
    if (!user || !user.twoFactorSecret)
        return res.status(400).json({ message: '2FA not enabled' });
    const ok = otplib_1.authenticator.verify({ token: String(otp), secret: user.twoFactorSecret });
    if (!ok)
        return res.status(401).json({ message: 'Invalid code' });
    await prisma_1.prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: false, twoFactorSecret: null } });
    res.json({ status: '2fa_disabled' });
});
router.post('/provider/setup-2fa', auth_1.authenticate, (0, auth_1.requireRole)(['PROVIDER_ADMIN']), async (req, res) => {
    const userJwt = req.user;
    const user = await prisma_1.prisma.user.findUnique({ where: { id: userJwt.id } });
    if (!user || user.role !== 'PROVIDER_ADMIN')
        return res.status(404).json({ message: 'User not found' });
    const secret = otplib_1.authenticator.generateSecret();
    const label = encodeURIComponent(`FaithConnect:${user.email}`);
    const issuer = encodeURIComponent('FaithConnect');
    const otpauth = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}`;
    const qrDataUrl = await qrcode_1.default.toDataURL(otpauth);
    await prisma_1.prisma.user.update({ where: { id: user.id }, data: { twoFactorSecret: secret } });
    res.json({ otpauth, qrDataUrl });
});
router.post('/provider/verify-2fa', auth_1.authenticate, (0, auth_1.requireRole)(['PROVIDER_ADMIN']), async (req, res) => {
    const userJwt = req.user;
    const { otp } = req.body;
    if (!otp)
        return res.status(400).json({ message: 'otp required' });
    const user = await prisma_1.prisma.user.findUnique({ where: { id: userJwt.id } });
    if (!user || user.role !== 'PROVIDER_ADMIN' || !user.twoFactorSecret)
        return res.status(400).json({ message: '2FA not initialized' });
    const ok = otplib_1.authenticator.verify({ token: String(otp), secret: user.twoFactorSecret });
    if (!ok)
        return res.status(401).json({ message: 'Invalid code' });
    await prisma_1.prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true } });
    res.json({ status: '2fa_enabled' });
});
router.post('/provider/disable-2fa', auth_1.authenticate, (0, auth_1.requireRole)(['PROVIDER_ADMIN']), async (req, res) => {
    const userJwt = req.user;
    const { otp } = req.body;
    const user = await prisma_1.prisma.user.findUnique({ where: { id: userJwt.id } });
    if (!user || user.role !== 'PROVIDER_ADMIN' || !user.twoFactorSecret)
        return res.status(400).json({ message: '2FA not enabled' });
    const ok = otplib_1.authenticator.verify({ token: String(otp), secret: user.twoFactorSecret });
    if (!ok)
        return res.status(401).json({ message: 'Invalid code' });
    await prisma_1.prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: false, twoFactorSecret: null } });
    res.json({ status: '2fa_disabled' });
});
// Public: list cell groups for a Church (tenant)
router.get('/public-cell-groups', tenant_1.tenantContext, tenant_1.requireTenant, async (req, res) => {
    const tid = req.tenantId;
    // Seed minimal defaults when empty
    const count = await prisma_1.prisma.cellGroup.count({ where: { tenantId: tid } });
    if (count === 0) {
        const names = ['Area 1', 'Area 2', 'Area 3', 'Area 4'];
        await prisma_1.prisma.cellGroup.createMany({ data: names.map(n => ({ name: n, tenantId: tid })) });
    }
    const q = String(req.query.q || '').trim();
    const where = q ? { tenantId: tid, OR: [{ name: { contains: q } }, { location: { contains: q } }] } : { tenantId: tid };
    const groups = await prisma_1.prisma.cellGroup.findMany({ where, orderBy: { name: 'asc' } });
    res.json(groups);
});
