"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../config/prisma");
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const multer_1 = __importDefault(require("multer"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.use(tenant_1.tenantContext);
// Visible to authorized staff
router.get('/', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const tid = req.tenantId;
    const list = await prisma_1.prisma.council.findMany({ where: { tenantId: tid }, include: { members: { include: { member: true } } }, orderBy: { name: 'asc' } });
    res.json(list);
});
// Details
router.get('/:id', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const tid = req.tenantId;
    const c = await prisma_1.prisma.council.findFirst({ where: { id, tenantId: tid }, include: { members: { include: { member: true } } } });
    if (!c)
        return res.status(404).json({ message: 'Council not found' });
    res.json(c);
});
// Create/update/delete restricted to staff
router.post('/', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const { name, description, contact, meetingSchedule } = req.body;
    if (!name)
        return res.status(400).json({ message: 'Name is required' });
    const tid = req.tenantId;
    const created = await prisma_1.prisma.council.create({ data: { name: String(name).trim(), description: description || null, contact: contact || null, meetingSchedule: meetingSchedule || null, tenantId: tid } });
    res.status(201).json(created);
});
router.put('/:id', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const data = req.body;
    const tid = req.tenantId;
    const updated = await prisma_1.prisma.council.update({ where: { id }, data: { ...data, tenantId: tid } });
    res.json(updated);
});
router.delete('/:id', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const tid = req.tenantId;
    const exists = await prisma_1.prisma.council.findFirst({ where: { id, tenantId: tid } });
    if (!exists)
        return res.status(404).json({ message: 'Council not found' });
    await prisma_1.prisma.council.delete({ where: { id } });
    res.status(204).end();
});
// Manage membership
router.post('/:id/members', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const { memberIds, memberId, role } = req.body;
    if (Array.isArray(memberIds)) {
        await prisma_1.prisma.$transaction(async (tx) => {
            const tid = req.tenantId;
            await tx.councilMember.deleteMany({ where: { councilId: id, tenantId: tid } });
            if (memberIds.length) {
                await tx.councilMember.createMany({ data: memberIds.map(m => ({ councilId: id, memberId: Number(m), tenantId: tid })) });
            }
        });
        return res.json({ status: 'ok' });
    }
    if (memberId) {
        const tid = req.tenantId;
        const created = await prisma_1.prisma.councilMember.create({ data: { councilId: id, memberId: Number(memberId), role: role || null, tenantId: tid } });
        return res.status(201).json(created);
    }
    return res.status(400).json({ message: 'Provide memberIds array or memberId' });
});
router.delete('/:id/members/:linkId', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const linkId = Number(req.params.linkId);
    const tid = req.tenantId;
    const exists = await prisma_1.prisma.councilMember.findFirst({ where: { id: linkId, tenantId: tid } });
    if (!exists)
        return res.status(404).json({ message: 'Membership not found' });
    await prisma_1.prisma.councilMember.delete({ where: { id: linkId } });
    res.status(204).end();
});
// Resources upload (filesystem-based index per council)
const councilUploads = path_1.default.join(__dirname, '../../uploads/councils');
const storage = multer_1.default.diskStorage({
    destination: (req, _file, cb) => {
        const dir = path_1.default.join(councilUploads, String(req.params.id));
        fs_1.default.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname);
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    }
});
const upload = (0, multer_1.default)({ storage });
router.get('/:id/resources', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), async (req, res) => {
    const dir = path_1.default.join(councilUploads, String(req.params.id));
    const indexPath = path_1.default.join(dir, 'index.json');
    let index = [];
    if (fs_1.default.existsSync(indexPath))
        index = JSON.parse(fs_1.default.readFileSync(indexPath, 'utf8'));
    res.json(index);
});
router.post('/:id/resources', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), upload.single('file'), async (req, res) => {
    const id = String(req.params.id);
    const file = req.file;
    if (!file)
        return res.status(400).json({ message: 'File is required' });
    const dir = path_1.default.join(councilUploads, id);
    const indexPath = path_1.default.join(dir, 'index.json');
    let index = [];
    if (fs_1.default.existsSync(indexPath))
        index = JSON.parse(fs_1.default.readFileSync(indexPath, 'utf8'));
    const prevVersions = index.filter(i => i.originalname === file.originalname);
    const nextVersion = prevVersions.length ? Math.max(...prevVersions.map(v => Number(v.version || 1))) + 1 : 1;
    const record = { filename: file.filename, originalname: file.originalname, uploadedAt: new Date().toISOString(), url: `/uploads/councils/${id}/${file.filename}`, version: nextVersion };
    index.push(record);
    fs_1.default.writeFileSync(indexPath, JSON.stringify(index, null, 2));
    res.status(201).json(record);
});
exports.default = router;
