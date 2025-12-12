"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tenantContext = tenantContext;
exports.requireTenant = requireTenant;
function tenantContext(req, res, next) {
    const user = req.user;
    const headerId = req.headers['x-tenant-id'];
    let tenantId = null;
    if (user && user.tenantId)
        tenantId = Number(user.tenantId);
    if (!tenantId && headerId) {
        const n = Number(headerId);
        if (!isNaN(n))
            tenantId = n;
    }
    req.tenantId = tenantId;
    // For tenant-bound routes, require tenantId
    const path = req.path || '';
    const tenantRequired = !path.startsWith('/provider');
    if (tenantRequired && !tenantId) {
        return res.status(400).json({ message: 'Tenant context required' });
    }
    next();
}
function requireTenant(req, res, next) {
    const tid = req.tenantId;
    if (!tid)
        return res.status(400).json({ message: 'Tenant context required' });
    next();
}
