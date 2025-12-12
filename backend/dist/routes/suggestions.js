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
// Storage for suggestion attachments
const attachDir = path_1.default.join(__dirname, '../../uploads/suggestions');
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        fs_1.default.mkdirSync(attachDir, { recursive: true });
        cb(null, attachDir);
    },
    filename: (req, file, cb) => {
        const userId = req.user?.id || 'anon';
        const ext = path_1.default.extname(file.originalname) || '';
        cb(null, `suggestion-${userId}-${Date.now()}${ext}`);
    },
});
const upload = (0, multer_1.default)({ storage });
// Submit a suggestion (any authenticated member)
router.post('/', upload.single('attachment'), (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR', 'MEMBER']), tenant_1.requireTenant, async (req, res) => {
    const { title, category, contentHtml } = req.body;
    if (!title || !contentHtml)
        return res.status(400).json({ message: 'title and contentHtml are required' });
    const fileObj = req.file;
    const attachmentPath = fileObj ? path_1.default.join('suggestions', fileObj.filename) : undefined;
    const created = await prisma_1.prisma.suggestion.create({
        data: {
            title: String(title).trim(),
            category: category ? String(category).trim() : undefined,
            contentHtml,
            attachmentPath,
            status: 'NEW',
            createdById: req.user?.id,
            tenantId: req.tenantId,
        },
    });
    res.status(201).json({ message: 'Suggestion submitted', suggestion: created });
});
// List suggestions (staff only)
router.get('/', (0, auth_1.requireRole)(['ADMIN', 'CLERK']), tenant_1.requireTenant, async (req, res) => {
    const tid = req.tenantId;
    const list = await prisma_1.prisma.suggestion.findMany({ where: { tenantId: tid }, orderBy: { createdAt: 'desc' } });
    res.json(list);
});
// Update status (staff)
router.put('/:id/status', (0, auth_1.requireRole)(['ADMIN', 'CLERK']), tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const { status } = req.body;
    const tid = req.tenantId;
    const existing = await prisma_1.prisma.suggestion.findFirst({ where: { id, tenantId: tid } });
    if (!existing)
        return res.status(404).json({ message: 'Suggestion not found' });
    const updated = await prisma_1.prisma.suggestion.update({ where: { id }, data: { status: status || null } });
    res.json(updated);
});
exports.default = router;
