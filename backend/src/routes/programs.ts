import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { tenantContext, requireTenant } from '../middleware/tenant';

const router = Router();
router.use(authenticate);
router.use(tenantContext);

// List programs (all roles can view)
router.get('/', requireTenant, async (req, res) => {
  const tid = (req as any).tenantId as number;
  const programs = await prisma.program.findMany({ where: { tenantId: tid }, orderBy: { startDate: 'asc' } });
  res.json(programs);
});

// Create program (ADMIN/CLERK/PASTOR)
router.post('/', requireRole(['ADMIN','CLERK','PASTOR']), requireTenant, async (req, res) => {
  const { name, description, startDate, endDate, location, status } = req.body as { name: string; description?: string; startDate: string; endDate?: string; location?: string; status?: string };
  if (!name || !startDate) return res.status(400).json({ message: 'name and startDate are required' });
  const tid = (req as any).tenantId as number;
  const created = await prisma.program.create({ data: { name, description, startDate: new Date(startDate), endDate: endDate ? new Date(endDate) : undefined, location, status, createdById: (req as any).user?.id, tenantId: tid } });
  res.status(201).json(created);
});

// Update program (ADMIN/CLERK/PASTOR)
router.put('/:id', requireRole(['ADMIN','CLERK','PASTOR']), requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const { name, description, startDate, endDate, location, status } = req.body as { name?: string; description?: string; startDate?: string; endDate?: string; location?: string; status?: string };
  const tid = (req as any).tenantId as number;
  const existing = await prisma.program.findFirst({ where: { id, tenantId: tid } });
  if (!existing) return res.status(404).json({ message: 'Program not found' });
  const updated = await prisma.program.update({ where: { id }, data: { name, description, startDate: startDate ? new Date(startDate) : undefined, endDate: endDate ? new Date(endDate) : null, location, status, tenantId: tid } });
  res.json(updated);
});

// Delete program (ADMIN/CLERK)
router.delete('/:id', requireRole(['ADMIN','CLERK']), requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const tid = (req as any).tenantId as number;
  const existing = await prisma.program.findFirst({ where: { id, tenantId: tid } });
  if (!existing) return res.status(404).json({ message: 'Program not found' });
  await prisma.program.delete({ where: { id } });
  res.status(204).end();
});

export default router;
