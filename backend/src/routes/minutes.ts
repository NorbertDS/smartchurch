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

// Storage helpers
const boardDir = path.join(__dirname, '../../uploads/minutes/board');
const businessDir = path.join(__dirname, '../../uploads/minutes/business');

function makeStorage(baseDir: string) {
  return multer.diskStorage({
    destination: (_req: unknown, _file: unknown, cb: any) => {
      fs.mkdirSync(baseDir, { recursive: true });
      cb(null, baseDir);
    },
    filename: (_req: any, file: any, cb: any) => {
      const ext = path.extname(file.originalname) || '.bin';
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
  });
}

const uploadBoard = multer({ storage: makeStorage(boardDir) });
const uploadBusiness = multer({ storage: makeStorage(businessDir) });

function validateFormat(filename: string): 'pdf'|'docx'|'txt'|null {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (ext === '.docx') return 'docx';
  if (ext === '.txt') return 'txt';
  return null;
}

// Board Minutes
router.get('/board', requireRole(['ADMIN','CLERK','PASTOR']), requireTenant, async (req, res) => {
  const { q, from, to } = req.query as { q?: string; from?: string; to?: string };
  const where: any = {};
  if (q) where.OR = [
    { title: { contains: q, mode: 'insensitive' } },
    { agendaTopics: { contains: q, mode: 'insensitive' } },
    { textContent: { contains: q, mode: 'insensitive' } },
  ];
  if (from || to) where.meetingDate = {
    gte: from ? new Date(from) : undefined,
    lte: to ? new Date(to) : undefined,
  };
  const tid = (req as any).tenantId as number;
  where.tenantId = tid;
  const list = await prisma.boardMinute.findMany({ where, orderBy: { meetingDate: 'desc' } });
  const actorId = (req as any).user?.id || null;
  await prisma.auditLog.create({ data: { userId: actorId || undefined, action: 'BOARD_MINUTE_LIST', entityType: 'BoardMinute', tenantId: tid } });
  res.json(list);
});

router.post('/board', requireRole(['ADMIN','CLERK','PASTOR']), requireTenant, uploadBoard.single('file'), async (req, res) => {
  const file = (req as any).file;
  const { title, meetingDate, agendaTopics, textContent, approvalSignature } = req.body as any;
  if (!file) return res.status(400).json({ message: 'File is required' });
  if (!title || !meetingDate) return res.status(400).json({ message: 'title and meetingDate are required' });
  const fmt = validateFormat(file.originalname);
  if (!fmt) return res.status(400).json({ message: 'Unsupported file format. Use PDF, DOCX, or TXT.' });
  const actorId = (req as any).user?.id || null;
  const tid = (req as any).tenantId as number;
  const urlPath = `/uploads/minutes/board/${file.filename}`;
  const created = await prisma.boardMinute.create({
    data: {
      title: String(title).trim(),
      meetingDate: new Date(meetingDate),
      agendaTopics: agendaTopics ? String(agendaTopics) : null,
      textContent: textContent ? String(textContent) : null,
      filePath: urlPath,
      format: fmt,
      version: 1,
      approvalSignature: approvalSignature ? String(approvalSignature) : null,
      createdById: actorId || undefined,
      updatedById: actorId || undefined,
      tenantId: tid,
      versions: {
        create: {
          version: 1,
          filePath: urlPath,
          changeNote: 'Initial upload',
          createdById: actorId || undefined,
          tenantId: tid,
        }
      }
    }
  });
  await prisma.auditLog.create({ data: { userId: actorId || undefined, action: 'BOARD_MINUTE_UPLOAD', entityType: 'BoardMinute', entityId: created.id, tenantId: tid } });
  res.status(201).json(created);
});

router.post('/board/:id/version', requireRole(['ADMIN','CLERK','PASTOR']), requireTenant, uploadBoard.single('file'), async (req, res) => {
  const id = Number(req.params.id);
  const file = (req as any).file;
  const { changeNote } = req.body as any;
  if (!file) return res.status(400).json({ message: 'File is required' });
  const fmt = validateFormat(file.originalname);
  if (!fmt) return res.status(400).json({ message: 'Unsupported file format. Use PDF, DOCX, or TXT.' });
  const actorId = (req as any).user?.id || null;
  const tid = (req as any).tenantId as number;
  const urlPath = `/uploads/minutes/board/${file.filename}`;
  const current = await prisma.boardMinute.findFirst({ where: { id, tenantId: tid } });
  if (!current) return res.status(404).json({ message: 'Board minute not found' });
  const nextVersion = (current.version || 1) + 1;
  const updated = await prisma.$transaction(async (tx) => {
    const up = await tx.boardMinute.update({ where: { id }, data: { version: nextVersion, filePath: urlPath, updatedById: actorId || undefined, tenantId: tid } });
    await tx.boardMinuteVersion.create({ data: { minuteId: id, version: nextVersion, filePath: urlPath, changeNote: changeNote || null, createdById: actorId || undefined, tenantId: tid } });
    await tx.auditLog.create({ data: { userId: actorId || undefined, action: 'BOARD_MINUTE_VERSION_ADD', entityType: 'BoardMinute', entityId: id, tenantId: tid } });
    return up;
  });
  res.json(updated);
});

router.put('/board/:id/approve', requireRole(['ADMIN','CLERK','PASTOR']), requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const actorId = (req as any).user?.id || null;
  const tid = (req as any).tenantId as number;
  const { approvalSignature } = req.body as any;
  const updated = await prisma.boardMinute.update({ where: { id }, data: { approved: true, approvedAt: new Date(), approvedById: actorId || undefined, approvalSignature: approvalSignature || null, tenantId: tid } });
  await prisma.auditLog.create({ data: { userId: actorId || undefined, action: 'BOARD_MINUTE_APPROVED', entityType: 'BoardMinute', entityId: id, tenantId: tid } });
  res.json(updated);
});

// Business Minutes
router.get('/business', requireRole(['ADMIN','CLERK','PASTOR']), requireTenant, async (req, res) => {
  const { q, from, to } = req.query as { q?: string; from?: string; to?: string };
  const where: any = {};
  if (q) where.OR = [
    { title: { contains: q, mode: 'insensitive' } },
    { agendaTopics: { contains: q, mode: 'insensitive' } },
    { textContent: { contains: q, mode: 'insensitive' } },
  ];
  if (from || to) where.meetingDate = {
    gte: from ? new Date(from) : undefined,
    lte: to ? new Date(to) : undefined,
  };
  const tid = (req as any).tenantId as number;
  where.tenantId = tid;
  const list = await prisma.businessMinute.findMany({ where, orderBy: { meetingDate: 'desc' } });
  const actorId = (req as any).user?.id || null;
  await prisma.auditLog.create({ data: { userId: actorId || undefined, action: 'BUSINESS_MINUTE_LIST', entityType: 'BusinessMinute', tenantId: tid } });
  res.json(list);
});

router.post('/business', requireRole(['ADMIN','CLERK','PASTOR']), requireTenant, uploadBusiness.single('file'), async (req, res) => {
  const file = (req as any).file;
  const { title, meetingDate, agendaTopics, textContent, businessType, approvalSignature } = req.body as any;
  if (!file) return res.status(400).json({ message: 'File is required' });
  if (!title || !meetingDate) return res.status(400).json({ message: 'title and meetingDate are required' });
  const fmt = validateFormat(file.originalname);
  if (!fmt) return res.status(400).json({ message: 'Unsupported file format. Use PDF, DOCX, or TXT.' });
  const actorId = (req as any).user?.id || null;
  const tid = (req as any).tenantId as number;
  const urlPath = `/uploads/minutes/business/${file.filename}`;
  const created = await prisma.businessMinute.create({
    data: {
      title: String(title).trim(),
      meetingDate: new Date(meetingDate),
      agendaTopics: agendaTopics ? String(agendaTopics) : null,
      textContent: textContent ? String(textContent) : null,
      filePath: urlPath,
      format: fmt,
      version: 1,
      businessType: businessType ? String(businessType) : null,
      approvalSignature: approvalSignature ? String(approvalSignature) : null,
      createdById: actorId || undefined,
      updatedById: actorId || undefined,
      tenantId: tid,
      versions: {
        create: {
          version: 1,
          filePath: urlPath,
          changeNote: 'Initial upload',
          createdById: actorId || undefined,
          tenantId: tid,
        }
      }
    }
  });
  await prisma.auditLog.create({ data: { userId: actorId || undefined, action: 'BUSINESS_MINUTE_UPLOAD', entityType: 'BusinessMinute', entityId: created.id, tenantId: tid } });
  res.status(201).json(created);
});

router.post('/business/:id/version', requireRole(['ADMIN','CLERK','PASTOR']), requireTenant, uploadBusiness.single('file'), async (req, res) => {
  const id = Number(req.params.id);
  const file = (req as any).file;
  const { changeNote } = req.body as any;
  if (!file) return res.status(400).json({ message: 'File is required' });
  const fmt = validateFormat(file.originalname);
  if (!fmt) return res.status(400).json({ message: 'Unsupported file format. Use PDF, DOCX, or TXT.' });
  const actorId = (req as any).user?.id || null;
  const tid = (req as any).tenantId as number;
  const urlPath = `/uploads/minutes/business/${file.filename}`;
  const current = await prisma.businessMinute.findFirst({ where: { id, tenantId: tid } });
  if (!current) return res.status(404).json({ message: 'Business minute not found' });
  const nextVersion = (current.version || 1) + 1;
  const updated = await prisma.$transaction(async (tx) => {
    const up = await tx.businessMinute.update({ where: { id }, data: { version: nextVersion, filePath: urlPath, updatedById: actorId || undefined, tenantId: tid } });
    await tx.businessMinuteVersion.create({ data: { minuteId: id, version: nextVersion, filePath: urlPath, changeNote: changeNote || null, createdById: actorId || undefined, tenantId: tid } });
    await tx.auditLog.create({ data: { userId: actorId || undefined, action: 'BUSINESS_MINUTE_VERSION_ADD', entityType: 'BusinessMinute', entityId: id, tenantId: tid } });
    return up;
  });
  res.json(updated);
});

router.put('/business/:id/approve', requireRole(['ADMIN','CLERK','PASTOR']), requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const actorId = (req as any).user?.id || null;
  const tid = (req as any).tenantId as number;
  const { approvalSignature } = req.body as any;
  const updated = await prisma.businessMinute.update({ where: { id }, data: { approved: true, approvedAt: new Date(), approvedById: actorId || undefined, approvalSignature: approvalSignature || null, tenantId: tid } });
  await prisma.auditLog.create({ data: { userId: actorId || undefined, action: 'BUSINESS_MINUTE_APPROVED', entityType: 'BusinessMinute', entityId: id, tenantId: tid } });
  res.json(updated);
});

export default router;
