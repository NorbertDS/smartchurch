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
  const { q, sort } = req.query as { q?: string; sort?: string };
  const where: any = {};
  if (q) where.OR = [
    { name: { contains: q, mode: 'insensitive' } },
    { responsibilities: { contains: q, mode: 'insensitive' } },
    { meetingFrequency: { contains: q, mode: 'insensitive' } },
  ];
  const tid = (req as any).tenantId as number;
  where.tenantId = tid;
  const orderBy = sort === 'name'
    ? ({ name: 'asc' } as const)
    : sort === 'frequency'
    ? ({ meetingFrequency: 'asc' } as const)
    : ({ name: 'asc' } as const);
  const list = await prisma.committee.findMany({ where, include: { members: { include: { member: true } }, chair: true }, orderBy });
  res.json(list);
});

// Details
router.get('/:id', requireRole(['ADMIN','CLERK','PASTOR']), requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const tid = (req as any).tenantId as number;
  const c = await prisma.committee.findFirst({ where: { id, tenantId: tid }, include: { members: { include: { member: true } }, chair: true } });
  if (!c) return res.status(404).json({ message: 'Committee not found' });
  res.json(c);
});

// Create/update/delete restricted to staff
router.post('/', requireRole(['ADMIN','CLERK','PASTOR']), requireTenant, async (req, res) => {
  const { name, responsibilities, meetingFrequency, chairMemberId } = req.body as any;
  if (!name) return res.status(400).json({ message: 'Name is required' });
  const tid = (req as any).tenantId as number;
  const created = await prisma.committee.create({ data: { name: String(name).trim(), responsibilities: responsibilities || null, meetingFrequency: meetingFrequency || null, chairMemberId: chairMemberId ? Number(chairMemberId) : null, tenantId: tid } });
  res.status(201).json(created);
});

router.put('/:id', requireRole(['ADMIN','CLERK','PASTOR']), requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const data = req.body as any;
  const tid = (req as any).tenantId as number;
  const updated = await prisma.committee.update({ where: { id }, data: { ...data, tenantId: tid } });
  res.json(updated);
});

router.delete('/:id', requireRole(['ADMIN','CLERK','PASTOR']), requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const tid = (req as any).tenantId as number;
  const exists = await prisma.committee.findFirst({ where: { id, tenantId: tid } });
  if (!exists) return res.status(404).json({ message: 'Committee not found' });
  await prisma.committee.delete({ where: { id } });
  res.status(204).end();
});

// Manage membership
router.post('/:id/members', requireRole(['ADMIN','CLERK','PASTOR']), requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const { memberIds, memberId, role } = req.body as { memberIds?: number[]; memberId?: number; role?: string };
  if (Array.isArray(memberIds)) {
    await prisma.$transaction(async (tx) => {
      const tid = (req as any).tenantId as number;
      await tx.committeeMember.deleteMany({ where: { committeeId: id, tenantId: tid } });
      if (memberIds.length) {
        await tx.committeeMember.createMany({ data: memberIds.map(m => ({ committeeId: id, memberId: Number(m), tenantId: tid })) });
      }
    });
    return res.json({ status: 'ok' });
  }
  if (memberId) {
    const tid = (req as any).tenantId as number;
    const created = await prisma.committeeMember.create({ data: { committeeId: id, memberId: Number(memberId), role: role || null, tenantId: tid } });
    return res.status(201).json(created);
  }
  return res.status(400).json({ message: 'Provide memberIds array or memberId' });
});

router.delete('/:id/members/:linkId', requireRole(['ADMIN','CLERK','PASTOR']), requireTenant, async (req, res) => {
  const linkId = Number(req.params.linkId);
  const tid = (req as any).tenantId as number;
  const exists = await prisma.committeeMember.findFirst({ where: { id: linkId, tenantId: tid } });
  if (!exists) return res.status(404).json({ message: 'Membership not found' });
  await prisma.committeeMember.delete({ where: { id: linkId } });
  res.status(204).end();
});

// Resources upload (filesystem-based index per committee)
const committeeUploads = path.join(__dirname, '../../uploads/committees');
const storage = multer.diskStorage({
  destination: (req: any, _file: any, cb: any) => {
    const dir = path.join(committeeUploads, String(req.params.id));
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
  const dir = path.join(committeeUploads, String(req.params.id));
  const indexPath = path.join(dir, 'index.json');
  let index: any[] = [];
  if (fs.existsSync(indexPath)) index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  res.json(index);
});

router.post('/:id/resources', requireRole(['ADMIN','CLERK','PASTOR']), upload.single('file'), async (req, res) => {
  const id = String(req.params.id);
  const file = (req as any).file;
  if (!file) return res.status(400).json({ message: 'File is required' });
  const dir = path.join(committeeUploads, id);
  const indexPath = path.join(dir, 'index.json');
  let index: any[] = [];
  if (fs.existsSync(indexPath)) index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const prevVersions = index.filter(i => i.originalname === file.originalname);
  const nextVersion = prevVersions.length ? Math.max(...prevVersions.map(v => Number(v.version || 1))) + 1 : 1;
  const record = { filename: file.filename, originalname: file.originalname, uploadedAt: new Date().toISOString(), url: `/uploads/committees/${id}/${file.filename}`, version: nextVersion };
  index.push(record);
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  res.status(201).json(record);
});

export default router;
