"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPlanKey = getPlanKey;
exports.getDefaultFeaturesForPlan = getDefaultFeaturesForPlan;
exports.computeTenantFeatures = computeTenantFeatures;
const PLAN_FEATURES = {
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
function getPlanKey(plan) {
    const p = String(plan || '').toUpperCase();
    if (p === 'PRO')
        return 'PRO';
    if (p === 'ENTERPRISE')
        return 'ENTERPRISE';
    return 'BASIC';
}
function getDefaultFeaturesForPlan(plan) {
    return { ...PLAN_FEATURES[getPlanKey(plan)] };
}
function computeTenantFeatures(input) {
    const base = getDefaultFeaturesForPlan(input.plan);
    const overrides = (input.tenantConfig && typeof input.tenantConfig === 'object') ? input.tenantConfig.features : null;
    if (!overrides || typeof overrides !== 'object')
        return base;
    const next = { ...base };
    for (const [k, v] of Object.entries(overrides)) {
        next[String(k)] = !!v;
    }
    return next;
}
