"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../config/prisma");
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const multer_1 = __importDefault(require("multer"));
const XLSX = __importStar(require("xlsx"));
const sync_1 = require("csv-parse/sync");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.use(tenant_1.tenantContext);
// Configure multer storage for member photos
const uploadDir = path_1.default.join(__dirname, '../../uploads/members');
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        fs_1.default.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const id = req.params.id || 'unknown';
        const ext = path_1.default.extname(file.originalname) || '.jpg';
        cb(null, `member-${id}-${Date.now()}${ext}`);
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (file && typeof file.mimetype === 'string' && file.mimetype.startsWith('image/')) {
            cb(null, true);
        }
        else {
            cb(new Error('Invalid file type. Only images are allowed'));
        }
    },
});
// Separate storage for import files
const importDir = path_1.default.join(__dirname, '../../uploads/imports');
const importStorage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        fs_1.default.mkdirSync(importDir, { recursive: true });
        cb(null, importDir);
    },
    filename: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname) || '';
        cb(null, `members-import-${Date.now()}${ext}`);
    },
});
const importUpload = (0, multer_1.default)({ storage: importStorage });
router.get('/', tenant_1.requireTenant, async (req, res) => {
    const { q, page, pageSize } = req.query;
    const hasPaging = q !== undefined || page !== undefined || pageSize !== undefined;
    const tid = req.tenantId;
    if (hasPaging) {
        const take = Math.max(1, Math.min(100, Number(pageSize) || 10));
        const pageNum = Math.max(1, Number(page) || 1);
        const skip = (pageNum - 1) * take;
        const where = q ? {
            OR: [
                { firstName: { contains: q, mode: 'insensitive' } },
                { lastName: { contains: q, mode: 'insensitive' } },
                { contact: { contains: q, mode: 'insensitive' } },
            ]
        } : {};
        // Exclude soft-deleted members
        where.deletedAt = null;
        where.tenantId = tid;
        where.membershipStatus = 'APPROVED';
        const [items, total] = await Promise.all([
            prisma_1.prisma.member.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
            prisma_1.prisma.member.count({ where }),
        ]);
        return res.json({ items, total, page: pageNum, pageSize: take });
    }
    const members = await prisma_1.prisma.member.findMany({ where: { deletedAt: null, tenantId: tid, membershipStatus: 'APPROVED' }, orderBy: { createdAt: 'desc' } });
    res.json(members);
});
// Pending members list (awaiting admin approval)
router.get('/pending', (0, auth_1.requireRole)(['ADMIN', 'CLERK']), tenant_1.requireTenant, async (req, res) => {
    const { q, page, pageSize } = req.query;
    const take = Math.max(1, Math.min(100, Number(pageSize) || 10));
    const pageNum = Math.max(1, Number(page) || 1);
    const skip = (pageNum - 1) * take;
    const tid = req.tenantId;
    const where = { membershipStatus: 'PENDING', deletedAt: null, tenantId: tid };
    if (q) {
        where.OR = [
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
            { contact: { contains: q, mode: 'insensitive' } },
        ];
    }
    const [items, total] = await Promise.all([
        prisma_1.prisma.member.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
        prisma_1.prisma.member.count({ where }),
    ]);
    res.json({ items, total, page: pageNum, pageSize: take });
});
// Current member profile for logged-in user
router.get('/me', tenant_1.requireTenant, async (req, res) => {
    const user = req.user;
    if (!user)
        return res.status(401).json({ message: 'Unauthenticated' });
    const tid = req.tenantId;
    const member = await prisma_1.prisma.member.findFirst({ where: { userId: user.id, tenantId: tid } });
    if (!member)
        return res.status(404).json({ message: 'No linked member profile' });
    res.json(member);
});
// List all departments a member belongs to (multi-membership)
router.get('/:id/departments', tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    try {
        const tid = req.tenantId;
        const departments = await prisma_1.prisma.$queryRaw `SELECT d.* FROM MemberDepartment md JOIN Department d ON d.id = md.departmentId WHERE md.memberId = ${id} AND d.tenantId = ${tid} ORDER BY d.name ASC`;
        res.json(departments);
    }
    catch (e) {
        res.status(500).json({ message: 'Failed to load member departments', error: String(e) });
    }
});
router.post('/', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const input = req.body || {};
    const tid = req.tenantId;
    const status = typeof input.membershipStatus === 'string' && input.membershipStatus.trim()
        ? String(input.membershipStatus).trim()
        : 'APPROVED';
    const joined = input.dateJoined ? new Date(input.dateJoined) : new Date();
    const data = { ...input, membershipStatus: status, dateJoined: joined, tenantId: tid };
    const member = await prisma_1.prisma.member.create({ data });
    res.status(201).json(member);
});
router.put('/:id', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const tid = req.tenantId;
    const updated = await prisma_1.prisma.member.update({ where: { id }, data: { ...req.body, tenantId: tid } });
    res.json(updated);
});
// Approve pending member
router.post('/:id/approve', (0, auth_1.requireRole)(['ADMIN', 'CLERK']), tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const tid = req.tenantId;
    const existing = await prisma_1.prisma.member.findFirst({ where: { id, tenantId: tid } });
    if (!existing)
        return res.status(404).json({ message: 'Member not found' });
    if (existing.deletedAt)
        return res.status(400).json({ message: 'Member is archived' });
    if (existing.membershipStatus && existing.membershipStatus !== 'PENDING') {
        return res.status(400).json({ message: 'Member is not pending' });
    }
    const data = { membershipStatus: 'APPROVED' };
    if (!existing.dateJoined)
        data.dateJoined = new Date();
    const updated = await prisma_1.prisma.member.update({ where: { id }, data });
    await prisma_1.prisma.auditLog.create({ data: { userId: req.user.id, action: 'MEMBER_APPROVED', entityType: 'Member', entityId: id, tenantId: tid } });
    res.json({ status: 'approved', member: updated });
});
// Self photo upload for logged-in member (non-admins allowed)
router.post('/me/photo', tenant_1.requireTenant, upload.single('photo'), async (req, res) => {
    const user = req.user;
    if (!user)
        return res.status(401).json({ message: 'Unauthenticated' });
    const file = req.file;
    if (!file)
        return res.status(400).json({ message: 'No photo uploaded' });
    const tid = req.tenantId;
    const member = await prisma_1.prisma.member.findFirst({ where: { userId: user.id, tenantId: tid } });
    if (!member)
        return res.status(404).json({ message: 'No linked member profile' });
    const urlPath = `/uploads/members/${file.filename}`;
    const updated = await prisma_1.prisma.member.update({ where: { id: member.id }, data: { photoUrl: urlPath } });
    await prisma_1.prisma.auditLog.create({ data: { userId: user.id, action: 'PROFILE_PHOTO_UPDATED', entityType: 'Member', entityId: member.id, tenantId: tid } });
    res.json({ url: urlPath, member: updated });
});
router.post('/:id/photo', (0, auth_1.requireRole)(['ADMIN', 'CLERK']), tenant_1.requireTenant, upload.single('photo'), async (req, res) => {
    const file = req.file;
    if (!file)
        return res.status(400).json({ message: 'No photo uploaded' });
    const idRaw = req.params.id;
    const id = Number(idRaw);
    if (!Number.isFinite(id))
        return res.status(400).json({ message: 'Invalid member id' });
    const urlPath = `/uploads/members/${file.filename}`;
    const updated = await prisma_1.prisma.member.update({ where: { id }, data: { photoUrl: urlPath } });
    res.json({ url: urlPath, member: updated });
});
// Family relations: get parents and children
router.get('/:id/family', tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const tid = req.tenantId;
    const [parents, children] = await Promise.all([
        prisma_1.prisma.familyRelation.findMany({ where: { childId: id, tenantId: tid }, include: { parent: true } }),
        prisma_1.prisma.familyRelation.findMany({ where: { parentId: id, tenantId: tid }, include: { child: true } }),
    ]);
    res.json({
        parents: parents.map(p => p.parent),
        children: children.map(c => c.child),
    });
});
// Set parents for a child (replace existing)
router.post('/:id/parents', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const childId = Number(req.params.id);
    const { parentIds } = req.body;
    if (!Array.isArray(parentIds))
        return res.status(400).json({ message: 'parentIds must be an array' });
    const tid = req.tenantId;
    await prisma_1.prisma.$transaction(async (tx) => {
        await tx.familyRelation.deleteMany({ where: { childId, tenantId: tid } });
        if (parentIds.length) {
            await tx.familyRelation.createMany({ data: parentIds.map(pid => ({ parentId: Number(pid), childId, tenantId: tid })) });
        }
    });
    res.json({ status: 'ok' });
});
// Set children for a parent (replace existing)
router.post('/:id/children', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), tenant_1.requireTenant, async (req, res) => {
    const parentId = Number(req.params.id);
    const { childIds } = req.body;
    if (!Array.isArray(childIds))
        return res.status(400).json({ message: 'childIds must be an array' });
    const tid = req.tenantId;
    await prisma_1.prisma.$transaction(async (tx) => {
        await tx.familyRelation.deleteMany({ where: { parentId, tenantId: tid } });
        if (childIds.length) {
            await tx.familyRelation.createMany({ data: childIds.map(cid => ({ parentId, childId: Number(cid), tenantId: tid })) });
        }
    });
    res.json({ status: 'ok' });
});
// Profile update request flow (non-admin submit; admin/clerk review)
router.post('/me/request-update', tenant_1.requireTenant, async (req, res) => {
    const user = req.user;
    if (!user)
        return res.status(401).json({ message: 'Unauthenticated' });
    const tid = req.tenantId;
    const member = await prisma_1.prisma.member.findFirst({ where: { userId: user.id, tenantId: tid } });
    if (!member)
        return res.status(404).json({ message: 'No linked member profile' });
    const { changes } = req.body;
    if (!changes || typeof changes !== 'object')
        return res.status(400).json({ message: 'Invalid changes payload' });
    const action = `PROFILE_UPDATE_REQUEST:${JSON.stringify(changes)}`;
    const log = await prisma_1.prisma.auditLog.create({ data: { userId: user.id, action, entityType: 'Member', entityId: member.id, tenantId: tid } });
    res.status(201).json({ status: 'request_submitted', requestId: log.id });
});
router.get('/me/requests', tenant_1.requireTenant, async (req, res) => {
    const user = req.user;
    if (!user)
        return res.status(401).json({ message: 'Unauthenticated' });
    const tid = req.tenantId;
    const member = await prisma_1.prisma.member.findFirst({ where: { userId: user.id, tenantId: tid } });
    if (!member)
        return res.status(404).json({ message: 'No linked member profile' });
    const logs = await prisma_1.prisma.auditLog.findMany({ where: { entityType: 'Member', entityId: member.id, tenantId: tid }, orderBy: { timestamp: 'asc' } });
    const requests = logs.filter(l => l.action.startsWith('PROFILE_UPDATE_REQUEST'));
    const approvals = logs.filter(l => l.action.startsWith('PROFILE_UPDATE_APPROVED'));
    const declines = logs.filter(l => l.action.startsWith('PROFILE_UPDATE_DECLINED'));
    const withStatus = requests.map(r => {
        const after = (a) => (new Date(a.timestamp).getTime() > new Date(r.timestamp).getTime());
        const approved = approvals.find(a => after(a));
        const declined = declines.find(d => after(d));
        let status = 'PENDING';
        if (approved)
            status = 'APPROVED';
        else if (declined)
            status = 'DECLINED';
        let changes = {};
        try {
            const json = r.action.split(':')[1];
            changes = JSON.parse(json);
        }
        catch { }
        return { id: r.id, changes, status, timestamp: r.timestamp };
    });
    res.json(withStatus);
});
router.get('/requests', (0, auth_1.requireRole)(['ADMIN', 'CLERK']), tenant_1.requireTenant, async (req, res) => {
    const tid = req.tenantId;
    const logs = await prisma_1.prisma.auditLog.findMany({ where: { action: { startsWith: 'PROFILE_UPDATE_REQUEST' }, entityType: 'Member', tenantId: tid }, orderBy: { timestamp: 'asc' } });
    const pending = await Promise.all(logs.map(async (r) => {
        const other = await prisma_1.prisma.auditLog.findMany({ where: { entityType: 'Member', entityId: r.entityId, timestamp: { gt: r.timestamp }, tenantId: tid } });
        const approved = other.find(a => a.action.startsWith('PROFILE_UPDATE_APPROVED'));
        const declined = other.find(a => a.action.startsWith('PROFILE_UPDATE_DECLINED'));
        let status = 'PENDING';
        if (approved)
            status = 'APPROVED';
        else if (declined)
            status = 'DECLINED';
        let changes = {};
        try {
            const json = r.action.split(':')[1];
            changes = JSON.parse(json);
        }
        catch { }
        const member = r.entityId ? await prisma_1.prisma.member.findFirst({ where: { id: r.entityId, tenantId: tid } }) : null;
        return { id: r.id, member, changes, status, timestamp: r.timestamp };
    }));
    res.json(pending);
});
router.post('/requests/:id/approve', (0, auth_1.requireRole)(['ADMIN', 'CLERK']), tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const tid = req.tenantId;
    const log = await prisma_1.prisma.auditLog.findFirst({ where: { id, tenantId: tid } });
    if (!log || !log.entityId)
        return res.status(404).json({ message: 'Request not found' });
    let changes = {};
    try {
        const json = log.action.split(':')[1];
        changes = JSON.parse(json);
    }
    catch { }
    const updated = await prisma_1.prisma.member.update({ where: { id: log.entityId }, data: changes });
    await prisma_1.prisma.auditLog.create({ data: { userId: req.user.id, action: 'PROFILE_UPDATE_APPROVED', entityType: 'Member', entityId: log.entityId, tenantId: tid } });
    res.json({ status: 'approved', member: updated });
});
router.post('/requests/:id/decline', (0, auth_1.requireRole)(['ADMIN', 'CLERK']), tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const tid = req.tenantId;
    const log = await prisma_1.prisma.auditLog.findFirst({ where: { id, tenantId: tid } });
    if (!log || !log.entityId)
        return res.status(404).json({ message: 'Request not found' });
    await prisma_1.prisma.auditLog.create({ data: { userId: req.user.id, action: 'PROFILE_UPDATE_DECLINED', entityType: 'Member', entityId: log.entityId, tenantId: tid } });
    res.json({ status: 'declined' });
});
// Generate member QR token (for attendance scanning)
router.get('/:id/qr-token', tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const tid = req.tenantId;
    const member = await prisma_1.prisma.member.findFirst({ where: { id, tenantId: tid } });
    if (!member)
        return res.status(404).json({ message: 'Member not found' });
    const secret = process.env.QR_SECRET || process.env.JWT_SECRET || 'changeme-super-secret-key';
    const token = jsonwebtoken_1.default.sign({ memberId: member.id, membershipNumber: member.membershipNumber || null }, secret, { expiresIn: '30d' });
    res.json({ token });
});
exports.default = router;
// Soft-delete member (archive)
router.delete('/:id', (0, auth_1.requireRole)(['ADMIN', 'CLERK']), tenant_1.requireTenant, async (req, res) => {
    const id = Number(req.params.id);
    const actorId = req.user?.id;
    const tid = req.tenantId;
    const exists = await prisma_1.prisma.member.findFirst({ where: { id, tenantId: tid } });
    if (!exists)
        return res.status(404).json({ message: 'Member not found' });
    if (exists.deletedAt)
        return res.status(400).json({ message: 'Member already archived' });
    await prisma_1.prisma.$transaction(async (tx) => {
        await tx.member.update({ where: { id }, data: { deletedAt: new Date(), deletedById: actorId } });
        await tx.auditLog.create({ data: { userId: actorId, action: 'MEMBER_SOFT_DELETE', entityType: 'Member', entityId: id, tenantId: tid } });
    });
    res.status(204).end();
});
const DEFAULT_COLUMNS = [
    { key: 'firstName', label: 'First Name', required: true, type: 'string', aliases: ['FirstName', 'Firstname', 'First Name'] },
    { key: 'lastName', label: 'Last Name', required: true, type: 'string', aliases: ['LastName', 'Lastname', 'Last Name'] },
    { key: 'gender', label: 'Gender', required: true, type: 'enum', enumValues: ['MALE', 'FEMALE', 'OTHER'], aliases: ['Gender'] },
    { key: 'contact', label: 'Contact', required: false, type: 'string', aliases: ['Contact', 'Phone', 'Phone Number'] },
    { key: 'address', label: 'Address', required: false, type: 'string', aliases: ['Address', 'Location'] },
    { key: 'spiritualStatus', label: 'Status', required: false, type: 'string', aliases: ['Status', 'Spiritual Status'] },
    { key: 'dateJoined', label: 'Joined', required: false, type: 'date', aliases: ['Joined', 'Date Joined'] },
    { key: 'membershipNumber', label: 'Membership Number', required: false, type: 'string', aliases: ['Membership', 'Membership No', 'Membership Number'] },
];
const ALLOWED_DEMOGRAPHICS = ['AMM', 'AWM', 'YOUTHS', 'AMBASSADORS', 'CHILDREN'];
async function getImportColumns(tenantId) {
    try {
        const s = tenantId
            ? await prisma_1.prisma.setting.findUnique({ where: { tenantId_key: { tenantId, key: 'member_import_columns' } } })
            : await prisma_1.prisma.setting.findFirst({ where: { key: 'member_import_columns' } });
        const cols = s ? JSON.parse(s.value) : DEFAULT_COLUMNS;
        if (!Array.isArray(cols) || cols.length === 0)
            return DEFAULT_COLUMNS;
        return cols;
    }
    catch {
        return DEFAULT_COLUMNS;
    }
}
const MEMBER_FIELD_KEYS = new Set([
    'firstName', 'lastName', 'gender', 'demographicGroup', 'dob', 'contact', 'address', 'spiritualStatus', 'dateJoined', 'photoUrl', 'baptized', 'dedicated', 'weddingDate', 'membershipNumber', 'membershipStatus', 'profession', 'talents', 'abilities', 'groupAffiliations'
]);
function normalizeBoolean(v) {
    if (v === undefined || v === null || v === '')
        return undefined;
    if (typeof v === 'boolean')
        return v;
    const s = String(v).trim().toLowerCase();
    if (['true', 'yes', 'y', '1'].includes(s))
        return true;
    if (['false', 'no', 'n', '0'].includes(s))
        return false;
    return undefined;
}
function normalizeDate(v) {
    if (!v && v !== 0)
        return undefined;
    if (v instanceof Date)
        return v;
    const s = String(v).trim();
    const d = new Date(s);
    return isNaN(d.getTime()) ? undefined : d;
}
function normalizeHeader(h) {
    return String(h || '').trim().toLowerCase().replace(/\s+/g, ' ');
}
function buildHeaderMap(headers, columns) {
    const map = new Map();
    for (const h of headers) {
        const norm = normalizeHeader(h);
        // Try direct match by key or alias
        let matched = null;
        for (const c of columns) {
            const aliases = [c.key, c.label, ...(c.aliases || [])].map(a => normalizeHeader(a));
            if (aliases.includes(norm)) {
                matched = c.key;
                break;
            }
            // Special: Name column combines first/last
            if (norm === 'name' && (c.key === 'firstName' || c.key === 'lastName')) {
                matched = 'name';
            }
        }
        if (matched)
            map.set(norm, matched);
        else
            map.set(norm, '');
    }
    return map;
}
function splitName(val) {
    const s = String(val || '').trim();
    if (!s)
        return { firstName: '', lastName: '' };
    const parts = s.split(/\s+/);
    const first = parts.shift() || '';
    const last = parts.join(' ') || '';
    return { firstName: first, lastName: last };
}
function validateAndMap(row, columns) {
    const errors = [];
    const headers = Object.keys(row);
    const headerMap = buildHeaderMap(headers, columns);
    const requiredKeys = columns.filter(c => c.required).map(c => c.key);
    const presentCanonical = new Set();
    const data = {};
    // Build canonical row with alias resolution
    for (const [origNorm, mappedKey] of headerMap.entries()) {
        const origHeader = headers.find(h => normalizeHeader(h) === origNorm);
        const value = origHeader ? row[origHeader] : undefined;
        if (!mappedKey)
            continue;
        if (mappedKey === 'name') {
            const { firstName, lastName } = splitName(value);
            data.firstName = firstName;
            data.lastName = lastName;
            presentCanonical.add('firstName');
            presentCanonical.add('lastName');
            continue;
        }
        data[mappedKey] = value;
        presentCanonical.add(mappedKey);
    }
    for (const k of requiredKeys) {
        if (!presentCanonical.has(k))
            errors.push(`Missing required column: ${k}`);
    }
    const firstName = String(data.firstName || '').trim();
    const lastName = String(data.lastName || '').trim();
    const gender = String(data.gender || '').trim().toUpperCase();
    if (!firstName)
        errors.push('firstName required');
    if (!lastName)
        errors.push('lastName required');
    const genderCol = columns.find(c => c.key === 'gender');
    const allowed = genderCol?.enumValues || ['MALE', 'FEMALE', 'OTHER'];
    if (!allowed.includes(gender))
        errors.push(`gender invalid: ${data.gender}`);
    let demographicGroup = undefined;
    if (data.demographicGroup) {
        const dg = String(data.demographicGroup).trim().toUpperCase();
        if (!ALLOWED_DEMOGRAPHICS.includes(dg))
            errors.push(`demographicGroup invalid: ${data.demographicGroup}`);
        else
            demographicGroup = dg;
    }
    const dob = normalizeDate(data.dob);
    if (data.dob && !dob)
        errors.push(`dob invalid: ${data.dob}`);
    const dateJoined = normalizeDate(data.dateJoined) || new Date();
    const baptized = normalizeBoolean(data.baptized);
    if (data.baptized !== undefined && baptized === undefined)
        errors.push(`baptized invalid: ${data.baptized}`);
    const dedicated = normalizeBoolean(data.dedicated);
    if (data.dedicated !== undefined && dedicated === undefined)
        errors.push(`dedicated invalid: ${data.dedicated}`);
    const weddingDate = normalizeDate(data.weddingDate);
    if (data.weddingDate && !weddingDate)
        errors.push(`weddingDate invalid: ${data.weddingDate}`);
    const extras = {};
    for (const c of columns) {
        if (!MEMBER_FIELD_KEYS.has(c.key) && data[c.key] !== undefined) {
            extras[c.key] = data[c.key];
        }
    }
    const mapped = {
        firstName,
        lastName,
        gender,
        demographicGroup,
        dob,
        contact: data.contact ? String(data.contact).trim() : undefined,
        address: data.address ? String(data.address).trim() : undefined,
        spiritualStatus: data.spiritualStatus ? String(data.spiritualStatus).trim() : undefined,
        dateJoined,
        photoUrl: data.photoUrl ? String(data.photoUrl).trim() : undefined,
        baptized,
        dedicated,
        weddingDate,
        membershipNumber: data.membershipNumber ? String(data.membershipNumber).trim() : undefined,
        membershipStatus: data.membershipStatus ? String(data.membershipStatus).trim() : undefined,
        profession: data.profession ? String(data.profession).trim() : undefined,
        talents: data.talents ? data.talents : undefined,
        abilities: data.abilities ? data.abilities : undefined,
        groupAffiliations: data.groupAffiliations ? data.groupAffiliations : undefined,
    };
    if (Object.keys(extras).length) {
        mapped.abilities = { ...(mapped.abilities || {}), extras };
    }
    return { errors, data: mapped };
}
function readFileRows(filePath) {
    const ext = path_1.default.extname(filePath).toLowerCase();
    if (ext === '.xlsx' || ext === '.xls') {
        const wb = XLSX.readFile(filePath);
        const ws = wb.Sheets[wb.SheetNames[0]];
        return XLSX.utils.sheet_to_json(ws, { defval: '' });
    }
    // assume CSV
    const content = fs_1.default.readFileSync(filePath, 'utf8');
    const records = (0, sync_1.parse)(content, { columns: true, skip_empty_lines: true });
    return records;
}
router.post('/import/preview', (0, auth_1.requireRole)(['ADMIN', 'CLERK']), tenant_1.requireTenant, importUpload.single('file'), async (req, res) => {
    if (!req.file)
        return res.status(400).json({ message: 'file is required' });
    const tid = req.tenantId;
    const columns = await getImportColumns(tid);
    const rows = readFileRows(req.file.path);
    const headers = rows.length ? Object.keys(rows[0]) : [];
    const headerMap = buildHeaderMap(headers, columns);
    const requiredKeys = columns.filter(c => c.required).map(c => c.key);
    const presentCanonical = new Set();
    for (const [origNorm, mappedKey] of headerMap.entries()) {
        if (!mappedKey)
            continue;
        if (mappedKey === 'name') {
            presentCanonical.add('firstName');
            presentCanonical.add('lastName');
            continue;
        }
        presentCanonical.add(mappedKey);
    }
    const missing = requiredKeys.filter(k => !presentCanonical.has(k));
    const knownAliases = new Set();
    for (const c of columns) {
        for (const a of [c.key, c.label, ...(c.aliases || [])])
            knownAliases.add(normalizeHeader(a));
    }
    const unknown = headers.map(h => normalizeHeader(h)).filter(h => !knownAliases.has(h) && h !== 'name');
    const mapped = rows.map((row, idx) => {
        const { errors, data } = validateAndMap(row, columns);
        return { index: idx + 1, errors, data };
    });
    const validCount = mapped.filter(m => m.errors.length === 0).length;
    const invalidCount = mapped.length - validCount;
    res.json({ file: path_1.default.basename(req.file.path), headers, missing, unknown, validCount, invalidCount, rows: mapped, requirements: { required: columns.filter(c => c.required).map(c => c.label), optional: columns.filter(c => !c.required).map(c => c.label) } });
});
router.post('/import/commit', (0, auth_1.requireRole)(['ADMIN', 'CLERK']), tenant_1.requireTenant, async (req, res) => {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0)
        return res.status(400).json({ message: 'rows array required from preview' });
    let created = 0, updated = 0, failed = 0;
    const results = [];
    const tid = req.tenantId;
    await prisma_1.prisma.$transaction(async (tx) => {
        for (const item of rows) {
            const { data } = item || {};
            const columns = await getImportColumns(tid);
            const { errors, data: mapped } = validateAndMap(data || {}, columns);
            if (errors.length) {
                failed++;
                results.push({ status: 'error', errors });
                continue;
            }
            try {
                if (mapped.membershipNumber) {
                    const existing = await tx.member.findFirst({ where: { membershipNumber: mapped.membershipNumber, tenantId: tid } });
                    if (existing) {
                        await tx.member.update({ where: { id: existing.id }, data: { ...mapped, tenantId: tid } });
                        updated++;
                        results.push({ status: 'updated', id: existing.id });
                    }
                    else {
                        const m = await tx.member.create({ data: { ...mapped, tenantId: tid } });
                        created++;
                        results.push({ status: 'created', id: m.id });
                    }
                }
                else {
                    const m = await tx.member.create({ data: { ...mapped, tenantId: tid } });
                    created++;
                    results.push({ status: 'created', id: m.id });
                }
            }
            catch (e) {
                failed++;
                results.push({ status: 'error', error: e?.message });
            }
        }
        await tx.auditLog.create({ data: { userId: req.user?.id, action: `MEMBER_IMPORT:${JSON.stringify({ created, updated, failed })}`, entityType: 'Member', tenantId: tid } });
    });
    res.json({ created, updated, failed, results });
});
