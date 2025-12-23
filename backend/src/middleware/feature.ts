import { Request, Response, NextFunction } from 'express';
import { computeTenantFeatures, type FeatureKey } from '../core/features';

export function requireFeature(feature: FeatureKey) {
  return (req: Request, res: Response, next: NextFunction) => {
    const tenant = (req as any).tenant as any;
    const sub = (req as any).subscription as any;
    const enabled = computeTenantFeatures({ plan: sub?.plan, tenantConfig: tenant?.config });
    if (!enabled[feature]) return res.status(403).json({ message: `Feature disabled: ${feature}` });
    next();
  };
}

