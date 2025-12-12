import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { tenantContext, requireTenant } from '../middleware/tenant';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';

const router = Router();
router.use(authenticate);
router.use(tenantContext);

const dir = path.join(__dirname, '../../uploads/qr');
function ensureDir() { fs.mkdirSync(dir, { recursive: true }); }

function baseUrl() {
  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  const env = String(process.env.PUBLIC_BASE_URL || '').trim();
  return env || `http://localhost:${port}`;
}

type Link = { id: number; url: string; title: string; active: boolean; qrImagePath?: string | null; updatedAt?: string; scanCount?: number; lastScannedAt?: string | null };

async function getLinks(tid: number): Promise<Link[]> {
  const s = await prisma.setting.findFirst({ where: { tenantId: tid, key: 'qr_links' } });
  if (!s) return [];
  try { return JSON.parse(s.value) as Link[]; } catch { return []; }
}

async function setLinks(tid: number, items: Link[]) {
  const str = JSON.stringify(items);
  const exists = await prisma.setting.findFirst({ where: { tenantId: tid, key: 'qr_links' } });
  if (exists) await prisma.setting.update({ where: { id: exists.id }, data: { value: str } });
  else await prisma.setting.create({ data: { key: 'qr_links', value: str, tenantId: tid } });
}

async function generatePng(tenantId: number, id: number, url: string) {
  ensureDir();
  const filename = `tenant-${tenantId}-qr-${id}.png`;
  const out = path.join(dir, filename);
  const pub = baseUrl();
  const useRedirect = !!process.env.PUBLIC_BASE_URL;
  const target = useRedirect ? `${pub}/qr/r/${tenantId}/${id}` : url;
  await QRCode.toFile(out, target, { errorCorrectionLevel: 'H', width: 400, margin: 1 });
  return `qr/${filename}`;
}

router.get('/links', requireRole(['ADMIN']), requireTenant, async (req, res) => {
  try {
    const tid = (req as any).tenantId as number;
    const list = await getLinks(tid);
    list.sort((a,b)=> new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
    res.json(list);
  } catch (e: any) {
    res.status(500).json({ message: 'Failed to load QR links', error: e?.message || String(e) });
  }
});

router.post('/links', requireRole(['ADMIN']), requireTenant, async (req, res) => {
  try {
    const tid = (req as any).tenantId as number;
    const schema = z.object({ url: z.string().url(), title: z.string().min(1).max(100), active: z.boolean().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Invalid payload', errors: parsed.error.issues });
    const { url, title, active } = parsed.data;
    const list = await getLinks(tid);
    const id = (list.reduce((m, i) => Math.max(m, i.id || 0), 0) || 0) + 1;
    if (active) list.forEach(i => { i.active = false; });
    const qrImagePath = await generatePng(tid, id, url);
    const row: Link = { id, url, title, active: !!active, qrImagePath, updatedAt: new Date().toISOString(), scanCount: 0 };
    list.push(row);
    await setLinks(tid, list);
    res.status(201).json(row);
  } catch (e: any) {
    res.status(500).json({ message: 'Failed to create QR link', error: e?.message || String(e) });
  }
});

router.put('/links/:id', requireRole(['ADMIN']), requireTenant, async (req, res) => {
  try {
    const tid = (req as any).tenantId as number;
    const id = Number(req.params.id);
    const list = await getLinks(tid);
    const idx = list.findIndex(i => i.id === id);
    if (idx === -1) return res.status(404).json({ message: 'QR link not found' });
    const schema = z.object({ url: z.string().url().optional(), title: z.string().min(1).max(100).optional(), active: z.boolean().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Invalid payload', errors: parsed.error.issues });
    const { url, title, active } = parsed.data;
    if (active === true) list.forEach(i => { i.active = false; });
    const current = list[idx];
    const nextUrl = url ?? current.url;
    const nextPath = await generatePng(tid, id, nextUrl);
    const updated: Link = { ...current, url: nextUrl, title: title ?? current.title, active: active ?? current.active, qrImagePath: nextPath, updatedAt: new Date().toISOString() };
    list[idx] = updated;
    await setLinks(tid, list);
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ message: 'Failed to update QR link', error: e?.message || String(e) });
  }
});

router.delete('/links/:id', requireRole(['ADMIN']), requireTenant, async (req, res) => {
  try {
    const tid = (req as any).tenantId as number;
    const id = Number(req.params.id);
    const list = await getLinks(tid);
    const next = list.filter(i => i.id !== id);
    await setLinks(tid, next);
    res.status(204).end();
  } catch (e: any) {
    res.status(500).json({ message: 'Failed to delete QR link', error: e?.message || String(e) });
  }
});

router.get('/active', requireTenant, async (req, res) => {
  try {
    const tid = (req as any).tenantId as number;
    const list = await getLinks(tid);
    const active = list.find(i => i.active) || null;
    res.json(active);
  } catch (e: any) {
    res.status(500).json({ message: 'Failed to load active QR', error: e?.message || String(e) });
  }
});

router.get('/r/:tenantId/:id', async (req, res) => {
  try {
    const tid = Number(req.params.tenantId);
    const id = Number(req.params.id);
    if (!tid || !id) return res.status(400).send('Invalid QR');
    const list = await getLinks(tid);
    const row = list.find(i => i.id === id);
    if (!row || !row.url || row.active === false) return res.status(404).send('QR not found');
    row.scanCount = (row.scanCount || 0) + 1;
    row.lastScannedAt = new Date().toISOString();
    await setLinks(tid, list);
    res.redirect(row.url);
  } catch (e: any) {
    res.status(500).send('QR redirect failed');
  }
});

export default router;
