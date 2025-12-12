import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { tenantContext, requireTenant } from '../middleware/tenant';

const router = Router();
router.use(authenticate);
router.use(tenantContext);

router.get('/', requireTenant, async (req, res) => {
  const tid = (req as any).tenantId as number;
  const list = await prisma.announcement.findMany({ where: { tenantId: tid }, orderBy: { createdAt: 'desc' } });
  res.json(list);
});

router.post('/', requireRole(['ADMIN', 'CLERK', 'PASTOR']), requireTenant, async (req, res) => {
  const { title, content, audience } = req.body;
  const tid = (req as any).tenantId as number;
  const created = await prisma.announcement.create({ data: { title, content, audience, tenantId: tid } });
  res.status(201).json(created);
});

router.put('/:id', requireRole(['ADMIN', 'CLERK', 'PASTOR']), requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const { title, content, audience } = req.body;
  const tid = (req as any).tenantId as number;
  const updated = await prisma.announcement.update({ where: { id }, data: { title, content, audience, tenantId: tid } });
  res.json(updated);
});

router.delete('/:id', requireRole(['ADMIN', 'CLERK']), requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const tid = (req as any).tenantId as number;
  const exists = await prisma.announcement.findFirst({ where: { id, tenantId: tid } });
  if (!exists) return res.status(404).json({ message: 'Announcement not found' });
  await prisma.announcement.delete({ where: { id } });
  res.status(204).send();
});

export default router;

