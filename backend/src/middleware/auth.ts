import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma';

export interface AuthUser {
  id: number;
  role: string;
  name: string;
  email: string;
  tenantId?: number | null;
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing Authorization header' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'changeme-super-secret-key') as AuthUser;
    (req as any).user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

export function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as AuthUser | undefined;
    if (!user) return res.status(401).json({ message: 'Unauthenticated' });
    if (!roles.includes(user.role)) return res.status(403).json({ message: 'Forbidden' });
    next();
  };
}

// Dynamic permission check controlled via Settings → role_permissions (JSON)
// Structure:
// {
//   "CLERK": { "add_members": true, "add_events": true, ... },
//   "PASTOR": { "add_members": false, ... }
// }
export function requirePermission(actionKey: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as AuthUser | undefined;
    if (!user) return res.status(401).json({ message: 'Unauthenticated' });
    if (user.role === 'ADMIN') return next();
    try {
      const tid = (req as any).tenantId as number | undefined;
      const s = tid
        ? await prisma.setting.findUnique({ where: { tenantId_key: { tenantId: tid, key: 'role_permissions' } } })
        : await prisma.setting.findFirst({ where: { key: 'role_permissions' } });
      let cfg: any = null;
      try { cfg = s ? JSON.parse(s.value) : null; } catch { cfg = null; }
      const roleCfg = (cfg && typeof cfg === 'object') ? cfg[user.role] : null;
      const allowed = roleCfg && Object.prototype.hasOwnProperty.call(roleCfg, actionKey)
        ? !!roleCfg[actionKey]
        : true; // default allow unless explicitly disabled
      if (!allowed) return res.status(403).json({ message: 'Action disabled by admin policy' });
      next();
    } catch (e) {
      // On settings read failure, default to allow to avoid hard lock; log could be added
      next();
    }
  };
}
