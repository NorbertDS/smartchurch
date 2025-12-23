"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tenantContext = tenantContext;
exports.requireTenant = requireTenant;
const prisma_1 = require("../config/prisma");
function tenantContext(req, res, next) {
    const user = req.user;
    const headerId = req.headers['x-tenant-id'];
    const queryId = req.query?.tenantId;
    let tenantId = null;
    if (user && user.tenantId)
        tenantId = Number(user.tenantId);
    if (!tenantId && headerId && user?.role !== 'PROVIDER_ADMIN') {
        const n = Number(headerId);
        if (!isNaN(n))
            tenantId = n;
    }
    if (!tenantId && queryId && user?.role !== 'PROVIDER_ADMIN') {
        const n = Number(queryId);
        if (!isNaN(n))
            tenantId = n;
    }
    req.tenantId = tenantId;
    next();
}
function requireTenant(req, res, next) {
    const tid = req.tenantId;
    if (!tid)
        return res.status(400).json({ message: 'Tenant context required' });
    (async () => {
        const tenant = await prisma_1.prisma.tenant.findUnique({ where: { id: tid } });
        if (!tenant)
            return res.status(404).json({ message: 'Tenant not found' });
        if (String(tenant.status || '').toUpperCase() !== 'ACTIVE')
            return res.status(403).json({ message: 'Tenant is not active' });
        req.tenant = tenant;
        next();
    })().catch((e) => {
        res.status(500).json({ message: e?.message || 'Failed to load tenant' });
    });
}
