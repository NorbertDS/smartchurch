"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../config/prisma");
const tenant_1 = require("../middleware/tenant");
const router = (0, express_1.Router)();
// Public landing configuration (read-only)
router.get('/landing', async (_req, res) => {
    try {
        const s = await prisma_1.prisma.setting.findFirst({ where: { key: 'landing_config' } });
        if (!s) {
            return res.json({
                heroTitle: 'Connect, organize, and grow your church community',
                heroSubtitle: 'A modern, secure church management system that streamlines membership, events, communication, and reporting — accessible anywhere.',
                ctaMemberLabel: 'Member Login',
                ctaAdminLabel: 'Admin Login',
                features: [
                    { title: 'Unified Dashboard', description: 'Clear insights into membership, finance, events, sermons, and attendance.', icon: '📊' },
                    { title: 'Smart Member Management', description: 'Import, segment, and track member growth and participation.', icon: '🗂️' },
                    { title: 'Communication Tools', description: 'Announcements, SMS, and suggestion box to keep everyone connected.', icon: '📣' },
                ],
                testimonials: [
                    { quote: '“FaithConnect helped us centralize our operations and engage our members more meaningfully.”', author: 'Church Administrator' },
                    { quote: '“The dashboard and attendance tracking saved hours every week.”', author: 'Pastoral Team' },
                ],
                heroImagePath: '',
                links: { features: '#features', testimonials: '#testimonials', getStarted: '#cta' },
            });
        }
        let cfg = {};
        try {
            cfg = JSON.parse(s.value);
        }
        catch { }
        return res.json(cfg || {});
    }
    catch (e) {
        res.status(500).json({ message: e?.message || 'Failed to load landing config' });
    }
});
let cachedStats = null;
let cachedAt = 0;
router.get('/stats', async (_req, res) => {
    try {
        const now = new Date();
        if (cachedStats && (Date.now() - cachedAt) < 30000) {
            return res.json({ ...cachedStats, cached: true, refreshedAt: new Date(cachedAt).toISOString() });
        }
        const since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
        const [members, events, departments, entries] = await Promise.all([
            prisma_1.prisma.member.count({}),
            prisma_1.prisma.event.count({ where: { date: { gte: now } } }),
            prisma_1.prisma.department.count({}),
            prisma_1.prisma.attendanceEntry.findMany({ where: { attendanceRecord: { date: { gte: since } } } }),
        ]);
        const total = entries.length;
        const present = entries.filter((e) => e.present).length;
        const attendancePercent = total ? Math.round((present / total) * 100) : 0;
        cachedStats = { members, events, departments, attendancePercent };
        cachedAt = Date.now();
        res.json({ ...cachedStats, cached: false, refreshedAt: new Date(cachedAt).toISOString() });
    }
    catch (e) {
        res.status(500).json({ message: e?.message || 'Failed to load stats' });
    }
});
exports.default = router;
// Public church info for the current tenant (name only)
router.get('/church-info', tenant_1.tenantContext, tenant_1.requireTenant, async (req, res) => {
    try {
        const tid = req.tenantId;
        const s = await prisma_1.prisma.setting.findFirst({ where: { key: 'church_info', tenantId: tid } });
        if (s) {
            try {
                const info = JSON.parse(s.value);
                const name = String(info?.name || '');
                const abbr = String(info?.sidebarName || (name ? name.split(' ').map((w) => w[0]).join('').toUpperCase() : ''));
                return res.json({ name, abbreviation: abbr });
            }
            catch { }
        }
        const t = await prisma_1.prisma.tenant.findUnique({ where: { id: tid } });
        const name = t?.name || '';
        const abbr = (t?.slug || '') || (name ? name.split(' ').map((w) => w[0]).join('').toUpperCase() : '');
        return res.json({ name, abbreviation: abbr });
    }
    catch (e) {
        res.status(500).json({ message: e?.message || 'Failed to load church info' });
    }
});
