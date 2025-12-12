"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../config/prisma");
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const qrcode_1 = __importDefault(require("qrcode"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const zod_1 = require("zod");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.use(tenant_1.tenantContext);
const dir = path_1.default.join(__dirname, '../../uploads/qr');
function ensureDir() { fs_1.default.mkdirSync(dir, { recursive: true }); }
function baseUrl() {
    const port = process.env.PORT ? Number(process.env.PORT) : 4000;
    const env = String(process.env.PUBLIC_BASE_URL || '').trim();
    return env || `http://localhost:${port}`;
}
async function getLinks(tid) {
    const s = await prisma_1.prisma.setting.findFirst({ where: { tenantId: tid, key: 'qr_links' } });
    if (!s)
        return [];
    try {
        return JSON.parse(s.value);
    }
    catch {
        return [];
    }
}
async function setLinks(tid, items) {
    const str = JSON.stringify(items);
    const exists = await prisma_1.prisma.setting.findFirst({ where: { tenantId: tid, key: 'qr_links' } });
    if (exists)
        await prisma_1.prisma.setting.update({ where: { id: exists.id }, data: { value: str } });
    else
        await prisma_1.prisma.setting.create({ data: { key: 'qr_links', value: str, tenantId: tid } });
}
async function generatePng(tenantId, id, url) {
    ensureDir();
    const filename = `tenant-${tenantId}-qr-${id}.png`;
    const out = path_1.default.join(dir, filename);
    const pub = baseUrl();
    const useRedirect = !!process.env.PUBLIC_BASE_URL;
    const target = useRedirect ? `${pub}/qr/r/${tenantId}/${id}` : url;
    await qrcode_1.default.toFile(out, target, { errorCorrectionLevel: 'H', width: 400, margin: 1 });
    return `qr/${filename}`;
}
router.get('/links', (0, auth_1.requireRole)(['ADMIN']), tenant_1.requireTenant, async (req, res) => {
    try {
        const tid = req.tenantId;
        const list = await getLinks(tid);
        list.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
        res.json(list);
    }
    catch (e) {
        res.status(500).json({ message: 'Failed to load QR links', error: e?.message || String(e) });
    }
});
router.post('/links', (0, auth_1.requireRole)(['ADMIN']), tenant_1.requireTenant, async (req, res) => {
    try {
        const tid = req.tenantId;
        const schema = zod_1.z.object({ url: zod_1.z.string().url(), title: zod_1.z.string().min(1).max(100), active: zod_1.z.boolean().optional() });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ message: 'Invalid payload', errors: parsed.error.issues });
        const { url, title, active } = parsed.data;
        const list = await getLinks(tid);
        const id = (list.reduce((m, i) => Math.max(m, i.id || 0), 0) || 0) + 1;
        if (active)
            list.forEach(i => { i.active = false; });
        const qrImagePath = await generatePng(tid, id, url);
        const row = { id, url, title, active: !!active, qrImagePath, updatedAt: new Date().toISOString(), scanCount: 0 };
        list.push(row);
        await setLinks(tid, list);
        res.status(201).json(row);
    }
    catch (e) {
        res.status(500).json({ message: 'Failed to create QR link', error: e?.message || String(e) });
    }
});
router.put('/links/:id', (0, auth_1.requireRole)(['ADMIN']), tenant_1.requireTenant, async (req, res) => {
    try {
        const tid = req.tenantId;
        const id = Number(req.params.id);
        const list = await getLinks(tid);
        const idx = list.findIndex(i => i.id === id);
        if (idx === -1)
            return res.status(404).json({ message: 'QR link not found' });
        const schema = zod_1.z.object({ url: zod_1.z.string().url().optional(), title: zod_1.z.string().min(1).max(100).optional(), active: zod_1.z.boolean().optional() });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ message: 'Invalid payload', errors: parsed.error.issues });
        const { url, title, active } = parsed.data;
        if (active === true)
            list.forEach(i => { i.active = false; });
        const current = list[idx];
        const nextUrl = url ?? current.url;
        const nextPath = await generatePng(tid, id, nextUrl);
        const updated = { ...current, url: nextUrl, title: title ?? current.title, active: active ?? current.active, qrImagePath: nextPath, updatedAt: new Date().toISOString() };
        list[idx] = updated;
        await setLinks(tid, list);
        res.json(updated);
    }
    catch (e) {
        res.status(500).json({ message: 'Failed to update QR link', error: e?.message || String(e) });
    }
});
router.delete('/links/:id', (0, auth_1.requireRole)(['ADMIN']), tenant_1.requireTenant, async (req, res) => {
    try {
        const tid = req.tenantId;
        const id = Number(req.params.id);
        const list = await getLinks(tid);
        const next = list.filter(i => i.id !== id);
        await setLinks(tid, next);
        res.status(204).end();
    }
    catch (e) {
        res.status(500).json({ message: 'Failed to delete QR link', error: e?.message || String(e) });
    }
});
router.get('/active', tenant_1.requireTenant, async (req, res) => {
    try {
        const tid = req.tenantId;
        const list = await getLinks(tid);
        const active = list.find(i => i.active) || null;
        res.json(active);
    }
    catch (e) {
        res.status(500).json({ message: 'Failed to load active QR', error: e?.message || String(e) });
    }
});
router.get('/r/:tenantId/:id', async (req, res) => {
    try {
        const tid = Number(req.params.tenantId);
        const id = Number(req.params.id);
        if (!tid || !id)
            return res.status(400).send('Invalid QR');
        const list = await getLinks(tid);
        const row = list.find(i => i.id === id);
        if (!row || !row.url || row.active === false)
            return res.status(404).send('QR not found');
        row.scanCount = (row.scanCount || 0) + 1;
        row.lastScannedAt = new Date().toISOString();
        await setLinks(tid, list);
        res.redirect(row.url);
    }
    catch (e) {
        res.status(500).send('QR redirect failed');
    }
});
exports.default = router;
