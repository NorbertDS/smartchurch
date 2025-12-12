import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { tenantContext, requireTenant } from '../middleware/tenant';
import multer from 'multer';
import fs from 'fs';
import path from 'path';

const router = Router();
router.use(authenticate);
router.use(tenantContext);

// Visible to authorized staff
router.get('/', requireRole(['ADMIN','CLERK','PASTOR']), requireTenant, async (req, res) => {
  const tid = (req as any).tenantId as number;
  const list = await prisma.council.findMany({ where: { tenantId: tid }, include: { members: { include: { member: true } } }, orderBy: { name: 'asc' } });
  res.json(list);
});

// Details
router.get('/:id', requireRole(['ADMIN','CLERK','PASTOR']), requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const tid = (req as any).tenantId as number;
  const c = await prisma.council.findFirst({ where: { id, tenantId: tid }, include: { members: { include: { member: true } } } });
  if (!c) return res.status(404).json({ message: 'Council not found' });
  res.json(c);
});

// Create/update/delete restricted to staff
router.post('/', requireRole(['ADMIN','CLERK','PASTOR']), requireTenant, async (req, res) => {
  const { name, description, contact, meetingSchedule } = req.body as any;
  if (!name) return res.status(400).json({ message: 'Name is required' });
  const tid = (req as any).tenantId as number;
  const created = await prisma.council.create({ data: { name: String(name).trim(), description: description || null, contact: contact || null, meetingSchedule: meetingSchedule || null, tenantId: tid } });
  res.status(201).json(created);
});

router.put('/:id', requireRole(['ADMIN','CLERK','PASTOR']), requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const data = req.body as any;
  const tid = (req as any).tenantId as number;
  const updated = await prisma.council.update({ where: { id }, data: { ...data, tenantId: tid } });
  res.json(updated);
});

router.delete('/:id', requireRole(['ADMIN','CLERK','PASTOR']), requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const tid = (req as any).tenantId as number;
  const exists = await prisma.council.findFirst({ where: { id, tenantId: tid } });
  if (!exists) return res.status(404).json({ message: 'Council not found' });
  await prisma.council.delete({ where: { id } });
  res.status(204).end();
});

// Manage membership
router.post('/:id/members', requireRole(['ADMIN','CLERK','PASTOR']), requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const { memberIds, memberId, role } = req.body as { memberIds?: number[]; memberId?: number; role?: string };
  if (Array.isArray(memberIds)) {
    await prisma.$transaction(async (tx) => {
      const tid = (req as any).tenantId as number;
      await tx.councilMember.deleteMany({ where: { councilId: id, tenantId: tid } });
      if (memberIds.length) {
        await tx.councilMember.createMany({ data: memberIds.map(m => ({ councilId: id, memberId: Number(m), tenantId: tid })) });
      }
    });
    return res.json({ status: 'ok' });
  }
  if (memberId) {
    const tid = (req as any).tenantId as number;
    const created = await prisma.councilMember.create({ data: { councilId: id, memberId: Number(memberId), role: role || null, tenantId: tid } });
    return res.status(201).json(created);
  }
  return res.status(400).json({ message: 'Provide memberIds array or memberId' });
});

router.delete('/:id/members/:linkId', requireRole(['ADMIN','CLERK','PASTOR']), requireTenant, async (req, res) => {
  const linkId = Number(req.params.linkId);
  const tid = (req as any).tenantId as number;
  const exists = await prisma.councilMember.findFirst({ where: { id: linkId, tenantId: tid } });
  if (!exists) return res.status(404).json({ message: 'Membership not found' });
  await prisma.councilMember.delete({ where: { id: linkId } });
  res.status(204).end();
});

// Resources upload (filesystem-based index per council)
const councilUploads = path.join(__dirname, '../../uploads/councils');
const storage = multer.diskStorage({
  destination: (req: any, _file: any, cb: any) => {
    const dir = path.join(councilUploads, String(req.params.id));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req: any, file: any, cb: any) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});
const upload = multer({ storage });

router.get('/:id/resources', requireRole(['ADMIN','CLERK','PASTOR']), async (req, res) => {
  const dir = path.join(councilUploads, String(req.params.id));
  const indexPath = path.join(dir, 'index.json');
  let index: any[] = [];
  if (fs.existsSync(indexPath)) index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  res.json(index);
});

router.post('/:id/resources', requireRole(['ADMIN','CLERK','PASTOR']), upload.single('file'), async (req, res) => {
  const id = String(req.params.id);
  const file = (req as any).file;
  if (!file) return res.status(400).json({ message: 'File is required' });
  const dir = path.join(councilUploads, id);
  const indexPath = path.join(dir, 'index.json');
  let index: any[] = [];
  if (fs.existsSync(indexPath)) index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const prevVersions = index.filter(i => i.originalname === file.originalname);
  const nextVersion = prevVersions.length ? Math.max(...prevVersions.map(v => Number(v.version || 1))) + 1 : 1;
  const record = { filename: file.filename, originalname: file.originalname, uploadedAt: new Date().toISOString(), url: `/uploads/councils/${id}/${file.filename}`, version: nextVersion };
  index.push(record);
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  res.status(201).json(record);
});

export default router;
