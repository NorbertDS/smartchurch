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

// Storage for suggestion attachments
const attachDir = path.join(__dirname, '../../uploads/suggestions');
const storage = multer.diskStorage({
  destination: (_req: any, _file: any, cb: any) => {
    fs.mkdirSync(attachDir, { recursive: true });
    cb(null, attachDir);
  },
  filename: (req: any, file: any, cb: any) => {
    const userId = (req as any).user?.id || 'anon';
    const ext = path.extname(file.originalname) || '';
    cb(null, `suggestion-${userId}-${Date.now()}${ext}`);
  },
});
const upload = multer({ storage });

// Submit a suggestion (any authenticated member)
router.post('/', upload.single('attachment'), requireRole(['ADMIN','CLERK','PASTOR','MEMBER']), requireTenant, async (req, res) => {
  const { title, category, contentHtml } = req.body as { title: string; category?: string; contentHtml: string };
  if (!title || !contentHtml) return res.status(400).json({ message: 'title and contentHtml are required' });
  const fileObj = (req as any).file as any;
  const attachmentPath = fileObj ? path.join('suggestions', fileObj.filename) : undefined;
  const created = await prisma.suggestion.create({
    data: {
      title: String(title).trim(),
      category: category ? String(category).trim() : undefined,
      contentHtml,
      attachmentPath,
      status: 'NEW',
      createdById: (req as any).user?.id,
      tenantId: (req as any).tenantId as number,
    },
  });
  res.status(201).json({ message: 'Suggestion submitted', suggestion: created });
});

// List suggestions (staff only)
router.get('/', requireRole(['ADMIN','CLERK']), requireTenant, async (req, res) => {
  const tid = (req as any).tenantId as number;
  const list = await prisma.suggestion.findMany({ where: { tenantId: tid }, orderBy: { createdAt: 'desc' } });
  res.json(list);
});

// Update status (staff)
router.put('/:id/status', requireRole(['ADMIN','CLERK']), requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body as { status?: string };
  const tid = (req as any).tenantId as number;
  const existing = await prisma.suggestion.findFirst({ where: { id, tenantId: tid } });
  if (!existing) return res.status(404).json({ message: 'Suggestion not found' });
  const updated = await prisma.suggestion.update({ where: { id }, data: { status: status || null } });
  res.json(updated);
});

export default router;
