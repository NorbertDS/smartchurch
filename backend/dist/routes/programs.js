"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../config/prisma");
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.use(tenant_1.tenantContext);
// List programs (all roles can view)
router.get('/', tenant_1.requireTenant, async (req, res) => {
    const tid = req.tenantId;
    const programs = await prisma_1.prisma.program.findMany({ where: { tenantId: tid }, orderBy: { startDate: 'asc' } });
    res.json(programs);
});
// Create program (ADMIN/CLERK/PASTOR)
router.post('/', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const { name, description, startDate, endDate, location, status } = req.body;
    if (!name || !startDate)
        return res.status(400).json({ message: 'name and startDate are required' });
    const tid = req.tenantId;
    const created = await prisma_1.prisma.program.create({ data: { name, description, startDate: new Date(startDate), endDate: endDate ? new Date(endDate) : undefined, location, status, createdById: req.user?.id, tenantId: tid } });
    res.status(201).json(created);
});
// Update program (ADMIN/CLERK/PASTOR)
router.put('/:id', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const { name, description, startDate, endDate, location, status } = req.body;
    const tid = req.tenantId;
    const existing = await prisma_1.prisma.program.findFirst({ where: { id, tenantId: tid } });
    if (!existing)
        return res.status(404).json({ message: 'Program not found' });
    const updated = await prisma_1.prisma.program.update({ where: { id }, data: { name, description, startDate: startDate ? new Date(startDate) : undefined, endDate: endDate ? new Date(endDate) : null, location, status, tenantId: tid } });
    res.json(updated);
});
// Delete program (ADMIN/CLERK)
router.delete('/:id', (0, auth_1.requireRole)(['ADMIN', 'CLERK']), tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const tid = req.tenantId;
    const existing = await prisma_1.prisma.program.findFirst({ where: { id, tenantId: tid } });
    if (!existing)
        return res.status(404).json({ message: 'Program not found' });
    await prisma_1.prisma.program.delete({ where: { id } });
    res.status(204).end();
});
exports.default = router;
