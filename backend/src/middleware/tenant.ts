import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma';

export function tenantContext(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user as { tenantId?: number | null; role?: string } | undefined;
  const headerId = req.headers['x-tenant-id'];
  const queryId = (req.query as any)?.tenantId;
  let tenantId: number | null = null;
  if (user && user.tenantId) tenantId = Number(user.tenantId);
  if (!tenantId && headerId && user?.role !== 'PROVIDER_ADMIN') {
    const n = Number(headerId);
    if (!isNaN(n)) tenantId = n;
  }
  if (!tenantId && queryId && user?.role !== 'PROVIDER_ADMIN') {
    const n = Number(queryId);
    if (!isNaN(n)) tenantId = n;
  }
  (req as any).tenantId = tenantId;
  next();
}

export function requireTenant(req: Request, res: Response, next: NextFunction) {
  const tid = (req as any).tenantId as number | null | undefined;
  if (!tid) return res.status(400).json({ message: 'Tenant context required' });
  (async () => {
    const tenant = await prisma.tenant.findUnique({ where: { id: tid } });
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    if (String(tenant.status || '').toUpperCase() !== 'ACTIVE') return res.status(403).json({ message: 'Tenant is not active' });
    (req as any).tenant = tenant;
    next();
  })().catch((e: any) => {
    res.status(500).json({ message: e?.message || 'Failed to load tenant' });
  });
}
