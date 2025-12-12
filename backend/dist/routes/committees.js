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
    const { q, sort } = req.query;
    const where = {};
    if (q)
        where.OR = [
            { name: { contains: q, mode: 'insensitive' } },
            { responsibilities: { contains: q, mode: 'insensitive' } },
            { meetingFrequency: { contains: q, mode: 'insensitive' } },
        ];
    const tid = req.tenantId;
    where.tenantId = tid;
    const orderBy = sort === 'name'
        ? { name: 'asc' }
        : sort === 'frequency'
            ? { meetingFrequency: 'asc' }
            : { name: 'asc' };
    const list = await prisma_1.prisma.committee.findMany({ where, include: { members: { include: { member: true } }, chair: true }, orderBy });
    res.json(list);
});
// Details
router.get('/:id', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const tid = req.tenantId;
    const c = await prisma_1.prisma.committee.findFirst({ where: { id, tenantId: tid }, include: { members: { include: { member: true } }, chair: true } });
    if (!c)
        return res.status(404).json({ message: 'Committee not found' });
    res.json(c);
});
// Create/update/delete restricted to staff
router.post('/', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const { name, responsibilities, meetingFrequency, chairMemberId } = req.body;
    if (!name)
        return res.status(400).json({ message: 'Name is required' });
    const tid = req.tenantId;
    const created = await prisma_1.prisma.committee.create({ data: { name: String(name).trim(), responsibilities: responsibilities || null, meetingFrequency: meetingFrequency || null, chairMemberId: chairMemberId ? Number(chairMemberId) : null, tenantId: tid } });
    res.status(201).json(created);
});
router.put('/:id', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const data = req.body;
    const tid = req.tenantId;
    const updated = await prisma_1.prisma.committee.update({ where: { id }, data: { ...data, tenantId: tid } });
    res.json(updated);
});
router.delete('/:id', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const tid = req.tenantId;
    const exists = await prisma_1.prisma.committee.findFirst({ where: { id, tenantId: tid } });
    if (!exists)
        return res.status(404).json({ message: 'Committee not found' });
    await prisma_1.prisma.committee.delete({ where: { id } });
    res.status(204).end();
});
// Manage membership
router.post('/:id/members', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const { memberIds, memberId, role } = req.body;
    if (Array.isArray(memberIds)) {
        await prisma_1.prisma.$transaction(async (tx) => {
            const tid = req.tenantId;
            await tx.committeeMember.deleteMany({ where: { committeeId: id, tenantId: tid } });
            if (memberIds.length) {
                await tx.committeeMember.createMany({ data: memberIds.map(m => ({ committeeId: id, memberId: Number(m), tenantId: tid })) });
            }
        });
        return res.json({ status: 'ok' });
    }
    if (memberId) {
        const tid = req.tenantId;
        const created = await prisma_1.prisma.committeeMember.create({ data: { committeeId: id, memberId: Number(memberId), role: role || null, tenantId: tid } });
        return res.status(201).json(created);
    }
    return res.status(400).json({ message: 'Provide memberIds array or memberId' });
});
router.delete('/:id/members/:linkId', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const linkId = Number(req.params.linkId);
    const tid = req.tenantId;
    const exists = await prisma_1.prisma.committeeMember.findFirst({ where: { id: linkId, tenantId: tid } });
    if (!exists)
        return res.status(404).json({ message: 'Membership not found' });
    await prisma_1.prisma.committeeMember.delete({ where: { id: linkId } });
    res.status(204).end();
});
// Resources upload (filesystem-based index per committee)
const committeeUploads = path_1.default.join(__dirname, '../../uploads/committees');
const storage = multer_1.default.diskStorage({
    destination: (req, _file, cb) => {
        const dir = path_1.default.join(committeeUploads, String(req.params.id));
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
    const dir = path_1.default.join(committeeUploads, String(req.params.id));
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
    const dir = path_1.default.join(committeeUploads, id);
    const indexPath = path_1.default.join(dir, 'index.json');
    let index = [];
    if (fs_1.default.existsSync(indexPath))
        index = JSON.parse(fs_1.default.readFileSync(indexPath, 'utf8'));
    const prevVersions = index.filter(i => i.originalname === file.originalname);
    const nextVersion = prevVersions.length ? Math.max(...prevVersions.map(v => Number(v.version || 1))) + 1 : 1;
    const record = { filename: file.filename, originalname: file.originalname, uploadedAt: new Date().toISOString(), url: `/uploads/committees/${id}/${file.filename}`, version: nextVersion };
    index.push(record);
    fs_1.default.writeFileSync(indexPath, JSON.stringify(index, null, 2));
    res.status(201).json(record);
});
exports.default = router;
