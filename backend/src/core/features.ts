export type FeatureKey =
  | 'core'
  | 'members'
  | 'departments'
  | 'events'
  | 'programs'
  | 'attendance'
  | 'finance'
  | 'announcements'
  | 'sermons'
  | 'reports'
  | 'minutes'
  | 'councils'
  | 'committees'
  | 'sms'
  | 'suggestions'
  | 'qr'
  | 'ai'
  | 'dynamic_pages';

export type PlanKey = 'BASIC' | 'PRO' | 'ENTERPRISE';

const PLAN_FEATURES: Record<PlanKey, Record<FeatureKey, boolean>> = {
  BASIC: {
    core: true,
    members: true,
    departments: true,
    events: true,
    programs: true,
    attendance: true,
    finance: true,
    announcements: true,
    sermons: true,
    reports: false,
    minutes: false,
    councils: false,
    committees: false,
    sms: false,
    suggestions: true,
    qr: false,
    ai: false,
    dynamic_pages: false,
  },
  PRO: {
    core: true,
    members: true,
    departments: true,
    events: true,
    programs: true,
    attendance: true,
    finance: true,
    announcements: true,
    sermons: true,
    reports: true,
    minutes: true,
    councils: true,
    committees: true,
    sms: true,
    suggestions: true,
    qr: true,
    ai: false,
    dynamic_pages: true,
  },
  ENTERPRISE: {
    core: true,
    members: true,
    departments: true,
    events: true,
    programs: true,
    attendance: true,
    finance: true,
    announcements: true,
    sermons: true,
    reports: true,
    minutes: true,
    councils: true,
    committees: true,
    sms: true,
    suggestions: true,
    qr: true,
    ai: true,
    dynamic_pages: true,
  },
};

export function getPlanKey(plan: any): PlanKey {
  const p = String(plan || '').toUpperCase();
  if (p === 'PRO') return 'PRO';
  if (p === 'ENTERPRISE') return 'ENTERPRISE';
  return 'BASIC';
}

export function getDefaultFeaturesForPlan(plan: any): Record<FeatureKey, boolean> {
  return { ...PLAN_FEATURES[getPlanKey(plan)] };
}

export function computeTenantFeatures(input: {
  plan?: any;
  tenantConfig?: any;
}): Record<FeatureKey, boolean> {
  const base = getDefaultFeaturesForPlan(input.plan);
  const overrides = (input.tenantConfig && typeof input.tenantConfig === 'object') ? (input.tenantConfig as any).features : null;
  if (!overrides || typeof overrides !== 'object') return base;
  const next: any = { ...base };
  for (const [k, v] of Object.entries(overrides)) {
    next[String(k)] = !!v;
  }
  return next as Record<FeatureKey, boolean>;
}

