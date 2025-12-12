import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { tenantContext, requireTenant } from '../middleware/tenant';

const router = Router();
router.use(authenticate);
router.use(tenantContext);

router.get('/', requireTenant, async (req, res) => {
  const tid = (req as any).tenantId as number;
  const list = await prisma.sermon.findMany({ where: { tenantId: tid }, orderBy: { date: 'desc' } });
  res.json(list);
});

router.post('/', requireRole(['ADMIN', 'CLERK', 'PASTOR']), requireTenant, async (req, res) => {
  const tid = (req as any).tenantId as number;
  const created = await prisma.sermon.create({ data: { ...req.body, tenantId: tid } });
  res.status(201).json(created);
});

router.put('/:id', requireRole(['ADMIN', 'CLERK', 'PASTOR']), requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const tid = (req as any).tenantId as number;
  const existing = await prisma.sermon.findFirst({ where: { id, tenantId: tid } });
  if (!existing) return res.status(404).json({ message: 'Sermon not found' });
  const updated = await prisma.sermon.update({ where: { id }, data: { ...req.body, tenantId: tid } });
  res.json(updated);
});

router.delete('/:id', requireRole(['ADMIN', 'CLERK']), requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const tid = (req as any).tenantId as number;
  const existing = await prisma.sermon.findFirst({ where: { id, tenantId: tid } });
  if (!existing) return res.status(404).json({ message: 'Sermon not found' });
  await prisma.sermon.delete({ where: { id } });
  res.status(204).send();
});

export default router;
