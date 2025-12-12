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
// Storage helpers
const boardDir = path_1.default.join(__dirname, '../../uploads/minutes/board');
const businessDir = path_1.default.join(__dirname, '../../uploads/minutes/business');
function makeStorage(baseDir) {
    return multer_1.default.diskStorage({
        destination: (_req, _file, cb) => {
            fs_1.default.mkdirSync(baseDir, { recursive: true });
            cb(null, baseDir);
        },
        filename: (_req, file, cb) => {
            const ext = path_1.default.extname(file.originalname) || '.bin';
            cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
        },
    });
}
const uploadBoard = (0, multer_1.default)({ storage: makeStorage(boardDir) });
const uploadBusiness = (0, multer_1.default)({ storage: makeStorage(businessDir) });
function validateFormat(filename) {
    const ext = path_1.default.extname(filename).toLowerCase();
    if (ext === '.pdf')
        return 'pdf';
    if (ext === '.docx')
        return 'docx';
    if (ext === '.txt')
        return 'txt';
    return null;
}
// Board Minutes
router.get('/board', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const { q, from, to } = req.query;
    const where = {};
    if (q)
        where.OR = [
            { title: { contains: q, mode: 'insensitive' } },
            { agendaTopics: { contains: q, mode: 'insensitive' } },
            { textContent: { contains: q, mode: 'insensitive' } },
        ];
    if (from || to)
        where.meetingDate = {
            gte: from ? new Date(from) : undefined,
            lte: to ? new Date(to) : undefined,
        };
    const tid = req.tenantId;
    where.tenantId = tid;
    const list = await prisma_1.prisma.boardMinute.findMany({ where, orderBy: { meetingDate: 'desc' } });
    const actorId = req.user?.id || null;
    await prisma_1.prisma.auditLog.create({ data: { userId: actorId || undefined, action: 'BOARD_MINUTE_LIST', entityType: 'BoardMinute', tenantId: tid } });
    res.json(list);
});
router.post('/board', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, uploadBoard.single('file'), async (req, res) => {
    const file = req.file;
    const { title, meetingDate, agendaTopics, textContent, approvalSignature } = req.body;
    if (!file)
        return res.status(400).json({ message: 'File is required' });
    if (!title || !meetingDate)
        return res.status(400).json({ message: 'title and meetingDate are required' });
    const fmt = validateFormat(file.originalname);
    if (!fmt)
        return res.status(400).json({ message: 'Unsupported file format. Use PDF, DOCX, or TXT.' });
    const actorId = req.user?.id || null;
    const tid = req.tenantId;
    const urlPath = `/uploads/minutes/board/${file.filename}`;
    const created = await prisma_1.prisma.boardMinute.create({
        data: {
            title: String(title).trim(),
            meetingDate: new Date(meetingDate),
            agendaTopics: agendaTopics ? String(agendaTopics) : null,
            textContent: textContent ? String(textContent) : null,
            filePath: urlPath,
            format: fmt,
            version: 1,
            approvalSignature: approvalSignature ? String(approvalSignature) : null,
            createdById: actorId || undefined,
            updatedById: actorId || undefined,
            tenantId: tid,
            versions: {
                create: {
                    version: 1,
                    filePath: urlPath,
                    changeNote: 'Initial upload',
                    createdById: actorId || undefined,
                    tenantId: tid,
                }
            }
        }
    });
    await prisma_1.prisma.auditLog.create({ data: { userId: actorId || undefined, action: 'BOARD_MINUTE_UPLOAD', entityType: 'BoardMinute', entityId: created.id, tenantId: tid } });
    res.status(201).json(created);
});
router.post('/board/:id/version', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, uploadBoard.single('file'), async (req, res) => {
    const id = Number(req.params.id);
    const file = req.file;
    const { changeNote } = req.body;
    if (!file)
        return res.status(400).json({ message: 'File is required' });
    const fmt = validateFormat(file.originalname);
    if (!fmt)
        return res.status(400).json({ message: 'Unsupported file format. Use PDF, DOCX, or TXT.' });
    const actorId = req.user?.id || null;
    const tid = req.tenantId;
    const urlPath = `/uploads/minutes/board/${file.filename}`;
    const current = await prisma_1.prisma.boardMinute.findFirst({ where: { id, tenantId: tid } });
    if (!current)
        return res.status(404).json({ message: 'Board minute not found' });
    const nextVersion = (current.version || 1) + 1;
    const updated = await prisma_1.prisma.$transaction(async (tx) => {
        const up = await tx.boardMinute.update({ where: { id }, data: { version: nextVersion, filePath: urlPath, updatedById: actorId || undefined, tenantId: tid } });
        await tx.boardMinuteVersion.create({ data: { minuteId: id, version: nextVersion, filePath: urlPath, changeNote: changeNote || null, createdById: actorId || undefined, tenantId: tid } });
        await tx.auditLog.create({ data: { userId: actorId || undefined, action: 'BOARD_MINUTE_VERSION_ADD', entityType: 'BoardMinute', entityId: id, tenantId: tid } });
        return up;
    });
    res.json(updated);
});
router.put('/board/:id/approve', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const actorId = req.user?.id || null;
    const tid = req.tenantId;
    const { approvalSignature } = req.body;
    const updated = await prisma_1.prisma.boardMinute.update({ where: { id }, data: { approved: true, approvedAt: new Date(), approvedById: actorId || undefined, approvalSignature: approvalSignature || null, tenantId: tid } });
    await prisma_1.prisma.auditLog.create({ data: { userId: actorId || undefined, action: 'BOARD_MINUTE_APPROVED', entityType: 'BoardMinute', entityId: id, tenantId: tid } });
    res.json(updated);
});
// Business Minutes
router.get('/business', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const { q, from, to } = req.query;
    const where = {};
    if (q)
        where.OR = [
            { title: { contains: q, mode: 'insensitive' } },
            { agendaTopics: { contains: q, mode: 'insensitive' } },
            { textContent: { contains: q, mode: 'insensitive' } },
        ];
    if (from || to)
        where.meetingDate = {
            gte: from ? new Date(from) : undefined,
            lte: to ? new Date(to) : undefined,
        };
    const tid = req.tenantId;
    where.tenantId = tid;
    const list = await prisma_1.prisma.businessMinute.findMany({ where, orderBy: { meetingDate: 'desc' } });
    const actorId = req.user?.id || null;
    await prisma_1.prisma.auditLog.create({ data: { userId: actorId || undefined, action: 'BUSINESS_MINUTE_LIST', entityType: 'BusinessMinute', tenantId: tid } });
    res.json(list);
});
router.post('/business', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, uploadBusiness.single('file'), async (req, res) => {
    const file = req.file;
    const { title, meetingDate, agendaTopics, textContent, businessType, approvalSignature } = req.body;
    if (!file)
        return res.status(400).json({ message: 'File is required' });
    if (!title || !meetingDate)
        return res.status(400).json({ message: 'title and meetingDate are required' });
    const fmt = validateFormat(file.originalname);
    if (!fmt)
        return res.status(400).json({ message: 'Unsupported file format. Use PDF, DOCX, or TXT.' });
    const actorId = req.user?.id || null;
    const tid = req.tenantId;
    const urlPath = `/uploads/minutes/business/${file.filename}`;
    const created = await prisma_1.prisma.businessMinute.create({
        data: {
            title: String(title).trim(),
            meetingDate: new Date(meetingDate),
            agendaTopics: agendaTopics ? String(agendaTopics) : null,
            textContent: textContent ? String(textContent) : null,
            filePath: urlPath,
            format: fmt,
            version: 1,
            businessType: businessType ? String(businessType) : null,
            approvalSignature: approvalSignature ? String(approvalSignature) : null,
            createdById: actorId || undefined,
            updatedById: actorId || undefined,
            tenantId: tid,
            versions: {
                create: {
                    version: 1,
                    filePath: urlPath,
                    changeNote: 'Initial upload',
                    createdById: actorId || undefined,
                    tenantId: tid,
                }
            }
        }
    });
    await prisma_1.prisma.auditLog.create({ data: { userId: actorId || undefined, action: 'BUSINESS_MINUTE_UPLOAD', entityType: 'BusinessMinute', entityId: created.id, tenantId: tid } });
    res.status(201).json(created);
});
router.post('/business/:id/version', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, uploadBusiness.single('file'), async (req, res) => {
    const id = Number(req.params.id);
    const file = req.file;
    const { changeNote } = req.body;
    if (!file)
        return res.status(400).json({ message: 'File is required' });
    const fmt = validateFormat(file.originalname);
    if (!fmt)
        return res.status(400).json({ message: 'Unsupported file format. Use PDF, DOCX, or TXT.' });
    const actorId = req.user?.id || null;
    const tid = req.tenantId;
    const urlPath = `/uploads/minutes/business/${file.filename}`;
    const current = await prisma_1.prisma.businessMinute.findFirst({ where: { id, tenantId: tid } });
    if (!current)
        return res.status(404).json({ message: 'Business minute not found' });
    const nextVersion = (current.version || 1) + 1;
    const updated = await prisma_1.prisma.$transaction(async (tx) => {
        const up = await tx.businessMinute.update({ where: { id }, data: { version: nextVersion, filePath: urlPath, updatedById: actorId || undefined, tenantId: tid } });
        await tx.businessMinuteVersion.create({ data: { minuteId: id, version: nextVersion, filePath: urlPath, changeNote: changeNote || null, createdById: actorId || undefined, tenantId: tid } });
        await tx.auditLog.create({ data: { userId: actorId || undefined, action: 'BUSINESS_MINUTE_VERSION_ADD', entityType: 'BusinessMinute', entityId: id, tenantId: tid } });
        return up;
    });
    res.json(updated);
});
router.put('/business/:id/approve', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const actorId = req.user?.id || null;
    const tid = req.tenantId;
    const { approvalSignature } = req.body;
    const updated = await prisma_1.prisma.businessMinute.update({ where: { id }, data: { approved: true, approvedAt: new Date(), approvedById: actorId || undefined, approvalSignature: approvalSignature || null, tenantId: tid } });
    await prisma_1.prisma.auditLog.create({ data: { userId: actorId || undefined, action: 'BUSINESS_MINUTE_APPROVED', entityType: 'BusinessMinute', entityId: id, tenantId: tid } });
    res.json(updated);
});
exports.default = router;
