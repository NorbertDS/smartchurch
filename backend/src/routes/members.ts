import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { tenantContext, requireTenant } from '../middleware/tenant';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { parse as parseCsv } from 'csv-parse/sync';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';

const router = Router();

router.use(authenticate);
router.use(tenantContext);

// Configure multer storage for member photos
const uploadDir = path.join(__dirname, '../../uploads/members');
const storage = multer.diskStorage({
  destination: (_req: unknown, _file: unknown, cb: any) => {
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req: any, file: any, cb: any) => {
    const id = (req.params as any).id || 'unknown';
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `member-${id}-${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req: any, file: any, cb: any) => {
    if (file && typeof file.mimetype === 'string' && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images are allowed'));
    }
  },
});

// Separate storage for import files
const importDir = path.join(__dirname, '../../uploads/imports');
const importStorage = multer.diskStorage({
  destination: (_req: unknown, _file: unknown, cb: any) => {
    fs.mkdirSync(importDir, { recursive: true });
    cb(null, importDir);
  },
  filename: (_req: any, file: any, cb: any) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `members-import-${Date.now()}${ext}`);
  },
});
const importUpload = multer({ storage: importStorage });

router.get('/', requireTenant, async (req, res) => {
  const { q, page, pageSize } = req.query as { q?: string; page?: string; pageSize?: string };
  const hasPaging = q !== undefined || page !== undefined || pageSize !== undefined;
  const tid = (req as any).tenantId as number;

  if (hasPaging) {
    const take = Math.max(1, Math.min(100, Number(pageSize) || 10));
    const pageNum = Math.max(1, Number(page) || 1);
    const skip = (pageNum - 1) * take;
    const where: any = q ? {
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
      prisma.member.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.member.count({ where }),
    ]);
    return res.json({ items, total, page: pageNum, pageSize: take });
  }

  const members = await prisma.member.findMany({ where: { deletedAt: null, tenantId: tid, membershipStatus: 'APPROVED' }, orderBy: { createdAt: 'desc' } });
  res.json(members);
});

// Pending members list (awaiting admin approval)
router.get('/pending', requireRole(['ADMIN','CLERK']), requireTenant, async (req, res) => {
  const { q, page, pageSize } = req.query as { q?: string; page?: string; pageSize?: string };
  const take = Math.max(1, Math.min(100, Number(pageSize) || 10));
  const pageNum = Math.max(1, Number(page) || 1);
  const skip = (pageNum - 1) * take;
  const tid = (req as any).tenantId as number;
  const where: any = { membershipStatus: 'PENDING', deletedAt: null, tenantId: tid };
  if (q) {
    where.OR = [
      { firstName: { contains: q, mode: 'insensitive' } },
      { lastName: { contains: q, mode: 'insensitive' } },
      { contact: { contains: q, mode: 'insensitive' } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.member.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.member.count({ where }),
  ]);
  res.json({ items, total, page: pageNum, pageSize: take });
});

// Current member profile for logged-in user
router.get('/me', requireTenant, async (req, res) => {
  const user = (req as any).user;
  if (!user) return res.status(401).json({ message: 'Unauthenticated' });
  const tid = (req as any).tenantId as number;
  const member = await prisma.member.findFirst({ where: { userId: user.id, tenantId: tid } });
  if (!member) return res.status(404).json({ message: 'No linked member profile' });
  res.json(member);
});

// List all departments a member belongs to (multi-membership)
router.get('/:id/departments', requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const tid = (req as any).tenantId as number;
    const departments = await prisma.$queryRaw<any[]>`SELECT d.* FROM MemberDepartment md JOIN Department d ON d.id = md.departmentId WHERE md.memberId = ${id} AND d.tenantId = ${tid} ORDER BY d.name ASC`;
    res.json(departments);
  } catch (e) {
    res.status(500).json({ message: 'Failed to load member departments', error: String(e) });
  }
});

router.post('/', requireRole(['ADMIN', 'CLERK', 'PASTOR']), requireTenant, async (req, res) => {
  const input = req.body || {};
  const tid = (req as any).tenantId as number;
  const status = typeof input.membershipStatus === 'string' && input.membershipStatus.trim()
    ? String(input.membershipStatus).trim()
    : 'APPROVED';
  const joined = input.dateJoined ? new Date(input.dateJoined) : new Date();
  const data = { ...input, membershipStatus: status, dateJoined: joined, tenantId: tid };
  const member = await prisma.member.create({ data });
  res.status(201).json(member);
});

router.put('/:id', requireRole(['ADMIN', 'CLERK', 'PASTOR']), requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const tid = (req as any).tenantId as number;
  const updated = await prisma.member.update({ where: { id }, data: { ...req.body, tenantId: tid } });
  res.json(updated);
});

// Approve pending member
router.post('/:id/approve', requireRole(['ADMIN','CLERK']), requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const tid = (req as any).tenantId as number;
  const existing = await prisma.member.findFirst({ where: { id, tenantId: tid } });
  if (!existing) return res.status(404).json({ message: 'Member not found' });
  if (existing.deletedAt) return res.status(400).json({ message: 'Member is archived' });
  if (existing.membershipStatus && existing.membershipStatus !== 'PENDING') {
    return res.status(400).json({ message: 'Member is not pending' });
  }
  const data: any = { membershipStatus: 'APPROVED' };
  if (!existing.dateJoined) data.dateJoined = new Date();
  const updated = await prisma.member.update({ where: { id }, data });
  await prisma.auditLog.create({ data: { userId: (req as any).user.id, action: 'MEMBER_APPROVED', entityType: 'Member', entityId: id, tenantId: tid } });
  res.json({ status: 'approved', member: updated });
});

// Self photo upload for logged-in member (non-admins allowed)
router.post('/me/photo', requireTenant, upload.single('photo'), async (req, res) => {
  const user = (req as any).user;
  if (!user) return res.status(401).json({ message: 'Unauthenticated' });
  const file = (req as any).file;
  if (!file) return res.status(400).json({ message: 'No photo uploaded' });
  const tid = (req as any).tenantId as number;
  const member = await prisma.member.findFirst({ where: { userId: user.id, tenantId: tid } });
  if (!member) return res.status(404).json({ message: 'No linked member profile' });
  const urlPath = `/uploads/members/${file.filename}`;
  const updated = await prisma.member.update({ where: { id: member.id }, data: { photoUrl: urlPath } });
  await prisma.auditLog.create({ data: { userId: user.id, action: 'PROFILE_PHOTO_UPDATED', entityType: 'Member', entityId: member.id, tenantId: tid } });
  res.json({ url: urlPath, member: updated });
});

router.post('/:id/photo', requireRole(['ADMIN', 'CLERK']), requireTenant, upload.single('photo'), async (req, res) => {
  const file = (req as any).file;
  if (!file) return res.status(400).json({ message: 'No photo uploaded' });
  const idRaw = (req.params as any).id;
  const id = Number(idRaw);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid member id' });
  const urlPath = `/uploads/members/${file.filename}`;
  const updated = await prisma.member.update({ where: { id }, data: { photoUrl: urlPath } });
  res.json({ url: urlPath, member: updated });
});

// Family relations: get parents and children
router.get('/:id/family', requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const tid = (req as any).tenantId as number;
  const [parents, children] = await Promise.all([
    prisma.familyRelation.findMany({ where: { childId: id, tenantId: tid }, include: { parent: true } }),
    prisma.familyRelation.findMany({ where: { parentId: id, tenantId: tid }, include: { child: true } }),
  ]);
  res.json({
    parents: parents.map(p => p.parent),
    children: children.map(c => c.child),
  });
});

// Set parents for a child (replace existing)
router.post('/:id/parents', requireRole(['ADMIN','CLERK','PASTOR']), requireTenant, async (req, res) => {
  const childId = Number(req.params.id);
  const { parentIds } = req.body as { parentIds: number[] };
  if (!Array.isArray(parentIds)) return res.status(400).json({ message: 'parentIds must be an array' });
  const tid = (req as any).tenantId as number;
  await prisma.$transaction(async (tx) => {
    await tx.familyRelation.deleteMany({ where: { childId, tenantId: tid } });
    if (parentIds.length) {
      await tx.familyRelation.createMany({ data: parentIds.map(pid => ({ parentId: Number(pid), childId, tenantId: tid })) });
    }
  });
  res.json({ status: 'ok' });
});

// Set children for a parent (replace existing)
router.post('/:id/children', requireRole(['ADMIN','CLERK','PASTOR']), requireTenant, async (req, res) => {
  const parentId = Number(req.params.id);
  const { childIds } = req.body as { childIds: number[] };
  if (!Array.isArray(childIds)) return res.status(400).json({ message: 'childIds must be an array' });
  const tid = (req as any).tenantId as number;
  await prisma.$transaction(async (tx) => {
    await tx.familyRelation.deleteMany({ where: { parentId, tenantId: tid } });
    if (childIds.length) {
      await tx.familyRelation.createMany({ data: childIds.map(cid => ({ parentId, childId: Number(cid), tenantId: tid })) });
    }
  });
  res.json({ status: 'ok' });
});

// Profile update request flow (non-admin submit; admin/clerk review)
router.post('/me/request-update', requireTenant, async (req, res) => {
  const user = (req as any).user;
  if (!user) return res.status(401).json({ message: 'Unauthenticated' });
  const tid = (req as any).tenantId as number;
  const member = await prisma.member.findFirst({ where: { userId: user.id, tenantId: tid } });
  if (!member) return res.status(404).json({ message: 'No linked member profile' });
  const { changes } = req.body as { changes: Record<string, any> };
  if (!changes || typeof changes !== 'object') return res.status(400).json({ message: 'Invalid changes payload' });
  const action = `PROFILE_UPDATE_REQUEST:${JSON.stringify(changes)}`;
  const log = await prisma.auditLog.create({ data: { userId: user.id, action, entityType: 'Member', entityId: member.id, tenantId: tid } });
  res.status(201).json({ status: 'request_submitted', requestId: log.id });
});

router.get('/me/requests', requireTenant, async (req, res) => {
  const user = (req as any).user;
  if (!user) return res.status(401).json({ message: 'Unauthenticated' });
  const tid = (req as any).tenantId as number;
  const member = await prisma.member.findFirst({ where: { userId: user.id, tenantId: tid } });
  if (!member) return res.status(404).json({ message: 'No linked member profile' });
  const logs = await prisma.auditLog.findMany({ where: { entityType: 'Member', entityId: member.id, tenantId: tid }, orderBy: { timestamp: 'asc' } });
  const requests = logs.filter(l => l.action.startsWith('PROFILE_UPDATE_REQUEST'));
  const approvals = logs.filter(l => l.action.startsWith('PROFILE_UPDATE_APPROVED'));
  const declines = logs.filter(l => l.action.startsWith('PROFILE_UPDATE_DECLINED'));
  const withStatus = requests.map(r => {
    const after = (a: { timestamp: Date }) => (new Date(a.timestamp).getTime() > new Date(r.timestamp).getTime());
    const approved = approvals.find(a => after(a));
    const declined = declines.find(d => after(d));
    let status: 'PENDING'|'APPROVED'|'DECLINED' = 'PENDING';
    if (approved) status = 'APPROVED'; else if (declined) status = 'DECLINED';
    let changes: any = {};
    try { const json = r.action.split(':')[1]; changes = JSON.parse(json); } catch {}
    return { id: r.id, changes, status, timestamp: r.timestamp };
  });
  res.json(withStatus);
});

router.get('/requests', requireRole(['ADMIN','CLERK']), requireTenant, async (req, res) => {
  const tid = (req as any).tenantId as number;
  const logs = await prisma.auditLog.findMany({ where: { action: { startsWith: 'PROFILE_UPDATE_REQUEST' }, entityType: 'Member', tenantId: tid }, orderBy: { timestamp: 'asc' } });
  const pending = await Promise.all(logs.map(async (r) => {
    const other = await prisma.auditLog.findMany({ where: { entityType: 'Member', entityId: r.entityId!, timestamp: { gt: r.timestamp }, tenantId: tid } });
    const approved = other.find(a => a.action.startsWith('PROFILE_UPDATE_APPROVED'));
    const declined = other.find(a => a.action.startsWith('PROFILE_UPDATE_DECLINED'));
    let status: 'PENDING'|'APPROVED'|'DECLINED' = 'PENDING';
    if (approved) status = 'APPROVED'; else if (declined) status = 'DECLINED';
    let changes: any = {};
    try { const json = r.action.split(':')[1]; changes = JSON.parse(json); } catch {}
    const member = r.entityId ? await prisma.member.findFirst({ where: { id: r.entityId, tenantId: tid } }) : null;
    return { id: r.id, member, changes, status, timestamp: r.timestamp };
  }));
  res.json(pending);
});

router.post('/requests/:id/approve', requireRole(['ADMIN','CLERK']), requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const tid = (req as any).tenantId as number;
  const log = await prisma.auditLog.findFirst({ where: { id, tenantId: tid } });
  if (!log || !log.entityId) return res.status(404).json({ message: 'Request not found' });
  let changes: any = {};
  try { const json = log.action.split(':')[1]; changes = JSON.parse(json); } catch {}
  const updated = await prisma.member.update({ where: { id: log.entityId }, data: changes });
  await prisma.auditLog.create({ data: { userId: (req as any).user.id, action: 'PROFILE_UPDATE_APPROVED', entityType: 'Member', entityId: log.entityId, tenantId: tid } });
  res.json({ status: 'approved', member: updated });
});

router.post('/requests/:id/decline', requireRole(['ADMIN','CLERK']), requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const tid = (req as any).tenantId as number;
  const log = await prisma.auditLog.findFirst({ where: { id, tenantId: tid } });
  if (!log || !log.entityId) return res.status(404).json({ message: 'Request not found' });
  await prisma.auditLog.create({ data: { userId: (req as any).user.id, action: 'PROFILE_UPDATE_DECLINED', entityType: 'Member', entityId: log.entityId, tenantId: tid } });
  res.json({ status: 'declined' });
});

// Generate member QR token (for attendance scanning)
router.get('/:id/qr-token', requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const tid = (req as any).tenantId as number;
  const member = await prisma.member.findFirst({ where: { id, tenantId: tid } });
  if (!member) return res.status(404).json({ message: 'Member not found' });
  const secret = process.env.QR_SECRET || process.env.JWT_SECRET || 'changeme-super-secret-key';
  const token = jwt.sign({ memberId: member.id, membershipNumber: member.membershipNumber || null }, secret, { expiresIn: '30d' });
  res.json({ token });
});

export default router;

// Soft-delete member (archive)
router.delete('/:id', requireRole(['ADMIN','CLERK']), requireTenant, async (req, res) => {
  const id = Number(req.params.id);
  const actorId = (req as any).user?.id;
  const tid = (req as any).tenantId as number;
  const exists = await prisma.member.findFirst({ where: { id, tenantId: tid } });
  if (!exists) return res.status(404).json({ message: 'Member not found' });
  if (exists.deletedAt) return res.status(400).json({ message: 'Member already archived' });
  await prisma.$transaction(async (tx) => {
    await tx.member.update({ where: { id }, data: { deletedAt: new Date(), deletedById: actorId } });
    await tx.auditLog.create({ data: { userId: actorId, action: 'MEMBER_SOFT_DELETE', entityType: 'Member', entityId: id, tenantId: tid } });
  });
  res.status(204).end();
});

// --- Member import (CSV/XLSX) with dynamic column config ---
type RawRow = Record<string, any>;

type MemberImportColumn = {
  key: string;
  label: string;
  required: boolean;
  type: 'string'|'date'|'boolean'|'enum'|'number';
  enumValues?: string[];
  aliases?: string[];
};

const DEFAULT_COLUMNS: MemberImportColumn[] = [
  { key: 'firstName', label: 'First Name', required: true, type: 'string', aliases: ['FirstName','Firstname','First Name'] },
  { key: 'lastName', label: 'Last Name', required: true, type: 'string', aliases: ['LastName','Lastname','Last Name'] },
  { key: 'gender', label: 'Gender', required: true, type: 'enum', enumValues: ['MALE','FEMALE','OTHER'], aliases: ['Gender'] },
  { key: 'contact', label: 'Contact', required: false, type: 'string', aliases: ['Contact','Phone','Phone Number'] },
  { key: 'address', label: 'Address', required: false, type: 'string', aliases: ['Address','Location'] },
  { key: 'spiritualStatus', label: 'Status', required: false, type: 'string', aliases: ['Status','Spiritual Status'] },
  { key: 'dateJoined', label: 'Joined', required: false, type: 'date', aliases: ['Joined','Date Joined'] },
  { key: 'membershipNumber', label: 'Membership Number', required: false, type: 'string', aliases: ['Membership','Membership No','Membership Number'] },
];

const ALLOWED_DEMOGRAPHICS = ['AMM','AWM','YOUTHS','AMBASSADORS','CHILDREN'];

async function getImportColumns(tenantId?: number): Promise<MemberImportColumn[]> {
  try {
    const s = tenantId
      ? await prisma.setting.findUnique({ where: { tenantId_key: { tenantId, key: 'member_import_columns' } } })
      : await prisma.setting.findFirst({ where: { key: 'member_import_columns' } });
    const cols = s ? JSON.parse(s.value) as MemberImportColumn[] : DEFAULT_COLUMNS;
    if (!Array.isArray(cols) || cols.length === 0) return DEFAULT_COLUMNS;
    return cols;
  } catch { return DEFAULT_COLUMNS; }
}

const MEMBER_FIELD_KEYS = new Set<string>([
  'firstName','lastName','gender','demographicGroup','dob','contact','address','spiritualStatus','dateJoined','photoUrl','baptized','dedicated','weddingDate','membershipNumber','membershipStatus','profession','talents','abilities','groupAffiliations'
]);

function normalizeBoolean(v: any): boolean | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  if (['true','yes','y','1'].includes(s)) return true;
  if (['false','no','n','0'].includes(s)) return false;
  return undefined;
}

function normalizeDate(v: any): Date | undefined {
  if (!v && v !== 0) return undefined;
  if (v instanceof Date) return v;
  const s = String(v).trim();
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

function normalizeHeader(h: string): string {
  return String(h || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildHeaderMap(headers: string[], columns: MemberImportColumn[]) {
  const map = new Map<string, string>();
  for (const h of headers) {
    const norm = normalizeHeader(h);
    // Try direct match by key or alias
    let matched: string | null = null;
    for (const c of columns) {
      const aliases = [c.key, c.label, ...(c.aliases || [])].map(a => normalizeHeader(a));
      if (aliases.includes(norm)) { matched = c.key; break; }
      // Special: Name column combines first/last
      if (norm === 'name' && (c.key === 'firstName' || c.key === 'lastName')) { matched = 'name'; }
    }
    if (matched) map.set(norm, matched);
    else map.set(norm, '');
  }
  return map;
}

function splitName(val: any) {
  const s = String(val || '').trim();
  if (!s) return { firstName: '', lastName: '' };
  const parts = s.split(/\s+/);
  const first = parts.shift() || '';
  const last = parts.join(' ') || '';
  return { firstName: first, lastName: last };
}

function validateAndMap(row: RawRow, columns: MemberImportColumn[]) {
  const errors: string[] = [];
  const headers = Object.keys(row);
  const headerMap = buildHeaderMap(headers, columns);
  const requiredKeys = columns.filter(c => c.required).map(c => c.key);
  const presentCanonical = new Set<string>();
  const data: any = {};

  // Build canonical row with alias resolution
  for (const [origNorm, mappedKey] of headerMap.entries()) {
    const origHeader = headers.find(h => normalizeHeader(h) === origNorm);
    const value = origHeader ? row[origHeader] : undefined;
    if (!mappedKey) continue;
    if (mappedKey === 'name') {
      const { firstName, lastName } = splitName(value);
      data.firstName = firstName; data.lastName = lastName;
      presentCanonical.add('firstName'); presentCanonical.add('lastName');
      continue;
    }
    data[mappedKey] = value;
    presentCanonical.add(mappedKey);
  }

  for (const k of requiredKeys) {
    if (!presentCanonical.has(k)) errors.push(`Missing required column: ${k}`);
  }

  const firstName = String(data.firstName || '').trim();
  const lastName = String(data.lastName || '').trim();
  const gender = String(data.gender || '').trim().toUpperCase();
  if (!firstName) errors.push('firstName required');
  if (!lastName) errors.push('lastName required');
  const genderCol = columns.find(c => c.key === 'gender');
  const allowed = genderCol?.enumValues || ['MALE','FEMALE','OTHER'];
  if (!allowed.includes(gender)) errors.push(`gender invalid: ${data.gender}`);

  let demographicGroup: any = undefined;
  if (data.demographicGroup) {
    const dg = String(data.demographicGroup).trim().toUpperCase();
    if (!ALLOWED_DEMOGRAPHICS.includes(dg)) errors.push(`demographicGroup invalid: ${data.demographicGroup}`);
    else demographicGroup = dg;
  }

  const dob = normalizeDate(data.dob);
  if (data.dob && !dob) errors.push(`dob invalid: ${data.dob}`);
  const dateJoined = normalizeDate(data.dateJoined) || new Date();
  const baptized = normalizeBoolean(data.baptized);
  if (data.baptized !== undefined && baptized === undefined) errors.push(`baptized invalid: ${data.baptized}`);
  const dedicated = normalizeBoolean(data.dedicated);
  if (data.dedicated !== undefined && dedicated === undefined) errors.push(`dedicated invalid: ${data.dedicated}`);
  const weddingDate = normalizeDate(data.weddingDate);
  if (data.weddingDate && !weddingDate) errors.push(`weddingDate invalid: ${data.weddingDate}`);

  const extras: Record<string, any> = {};
  for (const c of columns) {
    if (!MEMBER_FIELD_KEYS.has(c.key) && data[c.key] !== undefined) {
      extras[c.key] = data[c.key];
    }
  }

  const mapped: any = {
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

function readFileRows(filePath: string): RawRow[] {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.xlsx' || ext === '.xls') {
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { defval: '' }) as RawRow[];
  }
  // assume CSV
  const content = fs.readFileSync(filePath, 'utf8');
  const records = parseCsv(content, { columns: true, skip_empty_lines: true });
  return records as RawRow[];
}

router.post('/import/preview', requireRole(['ADMIN','CLERK']), requireTenant, importUpload.single('file'), async (req, res) => {
  if (!(req as any).file) return res.status(400).json({ message: 'file is required' });
  const tid = (req as any).tenantId as number;
  const columns = await getImportColumns(tid);
  const rows = readFileRows((req as any).file.path);
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const headerMap = buildHeaderMap(headers, columns);
  const requiredKeys = columns.filter(c => c.required).map(c => c.key);
  const presentCanonical = new Set<string>();
  for (const [origNorm, mappedKey] of headerMap.entries()) {
    if (!mappedKey) continue;
    if (mappedKey === 'name') { presentCanonical.add('firstName'); presentCanonical.add('lastName'); continue; }
    presentCanonical.add(mappedKey);
  }
  const missing = requiredKeys.filter(k => !presentCanonical.has(k));
  const knownAliases = new Set<string>();
  for (const c of columns) { for (const a of [c.key, c.label, ...(c.aliases||[])]) knownAliases.add(normalizeHeader(a)); }
  const unknown = headers.map(h => normalizeHeader(h)).filter(h => !knownAliases.has(h) && h !== 'name');
  const mapped = rows.map((row, idx) => {
    const { errors, data } = validateAndMap(row, columns);
    return { index: idx + 1, errors, data };
  });
  const validCount = mapped.filter(m => m.errors.length === 0).length;
  const invalidCount = mapped.length - validCount;
  res.json({ file: path.basename((req as any).file.path), headers, missing, unknown, validCount, invalidCount, rows: mapped, requirements: { required: columns.filter(c=>c.required).map(c=>c.label), optional: columns.filter(c=>!c.required).map(c=>c.label) } });
});

router.post('/import/commit', requireRole(['ADMIN','CLERK']), requireTenant, async (req, res) => {
  const { rows } = req.body as { rows: Array<{ data: any }> };
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ message: 'rows array required from preview' });
  let created = 0, updated = 0, failed = 0;
  const results: any[] = [];
  const tid = (req as any).tenantId as number;
  await prisma.$transaction(async (tx) => {
    for (const item of rows) {
      const { data } = item || {} as any;
      const columns = await getImportColumns(tid);
      const { errors, data: mapped } = validateAndMap(data || {}, columns);
      if (errors.length) { failed++; results.push({ status: 'error', errors }); continue; }
      try {
        if (mapped.membershipNumber) {
          const existing = await tx.member.findFirst({ where: { membershipNumber: mapped.membershipNumber, tenantId: tid } });
          if (existing) {
            await tx.member.update({ where: { id: existing.id }, data: { ...mapped, tenantId: tid } });
            updated++; results.push({ status: 'updated', id: existing.id });
          } else {
            const m = await tx.member.create({ data: { ...mapped, tenantId: tid } });
            created++; results.push({ status: 'created', id: m.id });
          }
        } else {
          const m = await tx.member.create({ data: { ...mapped, tenantId: tid } });
          created++; results.push({ status: 'created', id: m.id });
        }
      } catch (e: any) {
        failed++; results.push({ status: 'error', error: e?.message });
      }
    }
    await tx.auditLog.create({ data: { userId: (req as any).user?.id, action: `MEMBER_IMPORT:${JSON.stringify({ created, updated, failed })}`, entityType: 'Member', tenantId: tid } });
  });
  res.json({ created, updated, failed, results });
});
