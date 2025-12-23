import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma';

function shouldSample() {
  const r = Number(process.env.METRICS_SAMPLE_RATE || 0.05);
  if (!isFinite(r) || r <= 0) return false;
  if (r >= 1) return true;
  return Math.random() < r;
}

export function trackApiMetrics(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();
  const sample = shouldSample();
  res.on('finish', () => {
    if (!sample) return;
    const durationMs = Date.now() - startedAt;
    const method = String(req.method || 'GET');
    const path = String((req.baseUrl || '') + (req.path || '') || req.originalUrl || '');
    const status = Number(res.statusCode || 0);
    const tenantId = (req as any).tenantId ? Number((req as any).tenantId) : null;
    prisma.apiMetric.create({
      data: { method, path, status, durationMs, tenantId: tenantId || undefined },
    }).catch(() => {});
  });
  next();
}

