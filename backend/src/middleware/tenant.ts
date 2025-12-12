import { Request, Response, NextFunction } from 'express';

export function tenantContext(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user as { tenantId?: number | null; role?: string } | undefined;
  const headerId = req.headers['x-tenant-id'];
  let tenantId: number | null = null;
  if (user && user.tenantId) tenantId = Number(user.tenantId);
  if (!tenantId && headerId) {
    const n = Number(headerId);
    if (!isNaN(n)) tenantId = n;
  }
  (req as any).tenantId = tenantId;
  // For tenant-bound routes, require tenantId
  const path = req.path || '';
  const tenantRequired = !path.startsWith('/provider');
  if (tenantRequired && !tenantId) {
    return res.status(400).json({ message: 'Tenant context required' });
  }
  next();
}

export function requireTenant(req: Request, res: Response, next: NextFunction) {
  const tid = (req as any).tenantId as number | null | undefined;
  if (!tid) return res.status(400).json({ message: 'Tenant context required' });
  next();
}
