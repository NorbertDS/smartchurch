"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../config/prisma");
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.use(tenant_1.tenantContext);
router.get('/', tenant_1.requireTenant, async (req, res) => {
    const tid = req.tenantId;
    const list = await prisma_1.prisma.sermon.findMany({ where: { tenantId: tid }, orderBy: { date: 'desc' } });
    res.json(list);
});
router.post('/', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const tid = req.tenantId;
    const created = await prisma_1.prisma.sermon.create({ data: { ...req.body, tenantId: tid } });
    res.status(201).json(created);
});
router.put('/:id', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const tid = req.tenantId;
    const existing = await prisma_1.prisma.sermon.findFirst({ where: { id, tenantId: tid } });
    if (!existing)
        return res.status(404).json({ message: 'Sermon not found' });
    const updated = await prisma_1.prisma.sermon.update({ where: { id }, data: { ...req.body, tenantId: tid } });
    res.json(updated);
});
router.delete('/:id', (0, auth_1.requireRole)(['ADMIN', 'CLERK']), tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const tid = req.tenantId;
    const existing = await prisma_1.prisma.sermon.findFirst({ where: { id, tenantId: tid } });
    if (!existing)
        return res.status(404).json({ message: 'Sermon not found' });
    await prisma_1.prisma.sermon.delete({ where: { id } });
    res.status(204).send();
});
exports.default = router;
