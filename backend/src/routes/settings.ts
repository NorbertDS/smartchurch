import { Router } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { prisma } from '../config/prisma';
import { exportFullBackup, writeBackupToDisk, listBackups, restoreNonDestructive, validateConsistency } from '../services/backup';
import { authenticate, requireRole } from '../middleware/auth';
import { tenantContext, requireTenant } from '../middleware/tenant';

const router = Router();
const p: any = prisma;
router.use(authenticate);
router.use(tenantContext);

// Helper to get/set JSON settings
async function getSetting<T = any>(key: string, defaultValue: T, tenantId?: number): Promise<T> {
  const tid = typeof tenantId === 'number' ? tenantId : undefined;
  const s = await prisma.setting.findFirst({ where: { key, ...(tid ? { tenantId: tid } : {}) } });
  if (!s) return defaultValue;
  try { return JSON.parse(s.value) as T; } catch { return defaultValue; }
}

type LandingConfig = {
  heroTitle: string;
  heroSubtitle: string;
  ctaMemberLabel: string;
  ctaAdminLabel: string;
  features: any[];
  testimonials: any[];
  heroImagePath: string;
  links?: { features: string; testimonials: string; getStarted: string };
};

async function setSetting(key: string, value: any, tenantId?: number) {
  const str = JSON.stringify(value);
  const tid = typeof tenantId === 'number' ? tenantId : undefined;
  const exists = await prisma.setting.findFirst({ where: { key, ...(tid ? { tenantId: tid } : {}) } });
  if (exists) {
    await prisma.setting.update({ where: { id: exists.id }, data: { value: str } });
  } else {
    await prisma.setting.create({ data: { key, value: str, tenantId: tid as number } });
  }
}

// Church info (name, logo, contact, location) — readable by all authenticated roles
router.get('/info', requireTenant, async (req, res) => {
  const tid = (req as any).tenantId as number;
  const info = await getSetting('church_info', { name: '', sidebarName: '', logoUrl: '', contact: '', location: '' }, tid);
  res.json(info);
});

router.post('/info', requireRole(['ADMIN','CLERK']), requireTenant, async (req, res) => {
  const { name, sidebarName, logoUrl, contact, location } = req.body;
  const tid = (req as any).tenantId as number;
  await setSetting('church_info', { name, sidebarName, logoUrl, contact, location }, tid);
  res.status(200).json({ status: 'ok' });
});

// Update church info via PUT with audit logging (admin-only for stronger control)
router.put('/info', requireRole(['ADMIN']), requireTenant, async (req, res) => {
  const { name, sidebarName, logoUrl, contact, location } = req.body as { name?: string; sidebarName?: string; logoUrl?: string; contact?: string; location?: string };
  const tid = (req as any).tenantId as number;
  const prev = await getSetting('church_info', { name: '', sidebarName: '', logoUrl: '', contact: '', location: '' }, tid);
  const next = {
    name: typeof name === 'string' ? name : prev.name,
    sidebarName: typeof sidebarName === 'string' ? sidebarName : prev.sidebarName,
    logoUrl: typeof logoUrl === 'string' ? logoUrl : prev.logoUrl,
    contact: typeof contact === 'string' ? contact : prev.contact,
    location: typeof location === 'string' ? location : prev.location,
  };
  if (next.name && next.name.length > 50) return res.status(400).json({ message: 'name must be ≤ 50 characters' });
  await setSetting('church_info', next, tid);
  try {
    const user = (req as any).user;
    if (user?.id) {
      await prisma.auditLog.create({ data: { userId: user.id, action: 'SETTING_UPDATED', entityType: 'Setting', entityId: 0, tenant: { connect: { id: tid } } } });
    }
  } catch {}
  res.json({ status: 'ok', info: next });
});

// Email server (SMTP)
router.get('/email', requireRole(['ADMIN','CLERK']), requireTenant, async (req, res) => {
  const tid = (req as any).tenantId as number;
  const smtp = await getSetting('smtp_config', { host: '', port: 587, secure: false, user: '', pass: '' }, tid);
  res.json(smtp);
});

router.post('/email', requireRole(['ADMIN']), requireTenant, async (req, res) => {
  const { host, port, secure, user, pass } = req.body;
  const tid = (req as any).tenantId as number;
  await setSetting('smtp_config', { host, port, secure: !!secure, user, pass }, tid);
  res.status(200).json({ status: 'ok' });
});

// SMS provider setup (generic)
router.get('/sms', requireRole(['ADMIN','CLERK']), requireTenant, async (req, res) => {
  const tid = (req as any).tenantId as number;
  const sms = await getSetting('sms_config', { provider: '', apiKey: '', from: '' }, tid);
  res.json(sms);
});

router.post('/sms', requireRole(['ADMIN']), requireTenant, async (req, res) => {
  const { provider, apiKey, from } = req.body;
  const tid = (req as any).tenantId as number;
  await setSetting('sms_config', { provider, apiKey, from }, tid);
  res.status(200).json({ status: 'ok' });
});

// Department meeting templates (dynamic replacement for hardcoded UI data)
router.get('/templates/departments', requireRole(['ADMIN','CLERK','PASTOR']), requireTenant, async (req, res) => {
  const defaults = {
    Pastorate: ["Pastorate Council Meeting", "Leadership Retreat", "Pastoral Planning"],
    "Church Choir": ["Choir Practice", "Worship Rehearsal", "Music Workshop"],
    Deaconry: ["Deaconry Meeting", "Service Coordination", "Benevolence Planning"],
    Youth: ["Youth Fellowship", "Youth Bible Study", "Youth Outreach"],
    AWM: ["Women Fellowship", "AWM Prayer Meeting", "Mentorship Circle"],
    AMM: ["Men Fellowship", "AMM Prayer Meeting", "Brotherhood Gathering"],
    Children: ["Children Teachers Meeting", "Kids Department Workshop", "Family Day Planning"],
    Communication: ["Comms Sync", "Media Team Planning", "Social Media Strategy"],
  } as Record<string,string[]>;
  try {
    const tid = (req as any).tenantId as number;
    const s = await prisma.setting.findFirst({ where: { key: 'department_templates', tenantId: tid } });
    const val = s ? JSON.parse(s.value) : defaults;
    res.json(val || defaults);
  } catch {
    res.json(defaults);
  }
});

router.post('/templates/departments', requireRole(['ADMIN']), requireTenant, async (req, res) => {
  const templates = req.body as Record<string, string[]>;
  if (!templates || typeof templates !== 'object') return res.status(400).json({ message: 'Invalid templates payload' });
  const tid = (req as any).tenantId as number;
  await setSetting('department_templates', templates, tid);
  res.json({ status: 'ok' });
});

// Member import columns configuration
type MemberImportColumn = {
  key: string;
  label: string;
  required: boolean;
  type: 'string'|'date'|'boolean'|'enum'|'number';
  enumValues?: string[];
  aliases?: string[];
};

const DEFAULT_MEMBER_IMPORT_COLUMNS: MemberImportColumn[] = [
  { key: 'firstName', label: 'First Name', required: true, type: 'string', aliases: ['FirstName','Firstname','First Name'] },
  { key: 'lastName', label: 'Last Name', required: true, type: 'string', aliases: ['LastName','Lastname','Last Name'] },
  { key: 'gender', label: 'Gender', required: true, type: 'enum', enumValues: ['MALE','FEMALE','OTHER'], aliases: ['Gender'] },
  { key: 'contact', label: 'Contact', required: false, type: 'string', aliases: ['Contact','Phone','Phone Number'] },
  { key: 'address', label: 'Address', required: false, type: 'string', aliases: ['Address','Location'] },
  { key: 'spiritualStatus', label: 'Status', required: false, type: 'string', aliases: ['Status','Spiritual Status'] },
  { key: 'dateJoined', label: 'Joined', required: false, type: 'date', aliases: ['Joined','Date Joined'] },
  { key: 'membershipNumber', label: 'Membership Number', required: false, type: 'string', aliases: ['Membership','Membership No','Membership Number'] },
];

router.get('/member-import/columns', requireRole(['ADMIN','CLERK','PASTOR']), requireTenant, async (req, res) => {
  try {
    const tid = (req as any).tenantId as number;
    const cols = await getSetting<MemberImportColumn[]>('member_import_columns', DEFAULT_MEMBER_IMPORT_COLUMNS, tid);
    res.json(cols);
  } catch (e: any) {
    res.status(500).json({ message: e?.message || 'Failed to load import columns' });
  }
});

router.post('/member-import/columns', requireRole(['ADMIN']), requireTenant, async (req, res) => {
  const incoming = req.body as MemberImportColumn[];
  if (!Array.isArray(incoming)) return res.status(400).json({ message: 'Invalid payload: expected array' });
  // Server-side validation
  const keys = new Set<string>();
  for (const c of incoming) {
    if (!c || typeof c !== 'object') return res.status(400).json({ message: 'Invalid column object' });
    if (!c.key || !c.label) return res.status(400).json({ message: 'Each column requires key and label' });
    if (keys.has(c.key)) return res.status(400).json({ message: `Duplicate key: ${c.key}` });
    keys.add(c.key);
    const typeOk = ['string','date','boolean','enum','number'].includes(c.type);
    if (!typeOk) return res.status(400).json({ message: `Invalid type for ${c.key}` });
    if (c.type === 'enum') {
      if (!Array.isArray(c.enumValues) || c.enumValues.length === 0) return res.status(400).json({ message: `Enum ${c.key} must have values` });
    }
    if (c.aliases && !Array.isArray(c.aliases)) return res.status(400).json({ message: `aliases for ${c.key} must be array` });
  }
  const tid = (req as any).tenantId as number;
  await setSetting('member_import_columns', incoming, tid);
  try {
    const user = (req as any).user;
    if (user?.id) await prisma.auditLog.create({ data: { userId: user.id, action: 'MEMBER_IMPORT_COLUMNS_UPDATED', entityType: 'Setting', tenant: { connect: { id: tid } } } });
  } catch {}
  res.json({ status: 'ok' });
});

// Backup: export core tables to JSON
router.get('/backup', requireRole(['ADMIN']), requireTenant, async (req, res) => {
  const tid = (req as any).tenantId as number;
  const data = await exportFullBackup(tid);
  res.json(data);
});

// New: create and persist backup file on disk
router.post('/backup', requireRole(['ADMIN']), requireTenant, async (req, res) => {
  try {
    const tid = (req as any).tenantId as number;
    const data = await exportFullBackup(tid);
    const written = await writeBackupToDisk(data);
    res.json({ success: true, meta: data.meta, file: written.filePath, size: written.size });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// New: list available backup files
router.get('/backup/list', requireRole(['ADMIN']), requireTenant, async (_req, res) => {
  try {
    const files = listBackups();
    res.json({ success: true, files });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Admin: Restore by member name. Scans backups for a member and restores selected entities
router.post('/backup/restore-by-member', requireRole(['ADMIN']), requireTenant, async (req, res) => {
  const { name, strategy, include } = req.body as { name: string; strategy?: 'latest'|'earliest'; include?: string[] };
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ success: false, message: 'Provide full member name (e.g., "First Last")' });
  }
  const tid = (req as any).tenantId as number;
  const normalized = name.trim().toLowerCase();
  try {
    let files = listBackups();
    if (!files.length) return res.status(404).json({ success: false, message: 'No backups available' });
    // listBackups returns newest-first; allow earliest-first when requested
    if (strategy === 'earliest') files = [...files].reverse();

    for (const f of files) {
      try {
        const raw = fs.readFileSync(f.file, 'utf-8');
        const payload = JSON.parse(raw || '{}');
        const members = Array.isArray(payload.members) ? payload.members : [];
        const match = members.some((m: any) => {
          const full = `${(m.firstName||'').trim()} ${(m.lastName||'').trim()}`.trim().toLowerCase();
          if (full === normalized) return true;
          const qParts = normalized.split(/\s+/);
          const fParts = full.split(/\s+/);
          return qParts.every(p => fParts.includes(p));
        });
        if (!match) continue;

        const includeList = Array.isArray(include) && include.length ? include : ['users','members','departments'];
        const selected: any = {};
        for (const key of includeList) {
          if (Array.isArray(payload[key])) selected[key] = payload[key];
        }
        const result = await restoreNonDestructive(selected, tid);
        return res.json({ success: true, restoredFor: name, sourceFile: f.file, summary: result.summary });
      } catch {
        // continue on parse errors
      }
    }
    return res.status(404).json({ success: false, message: 'Member not found in any backup' });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Restore: import selected parts (settings + announcements for now)
// Updated: non-destructive restore across entities
router.post('/restore', requireRole(['ADMIN']), requireTenant, async (req, res) => {
  try {
    const payload = req.body || {};
    const tid = (req as any).tenantId as number;
    const result = await restoreNonDestructive(payload, tid);
    res.json({ success: true, summary: result.summary });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// New: data consistency validation
router.get('/consistency', requireRole(['ADMIN','CLERK','PASTOR']), requireTenant, async (req, res) => {
  try {
    const tid = (req as any).tenantId as number;
    const { issues } = await validateConsistency(tid);
    res.json({ success: true, issues, healthy: issues.length === 0 });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Landing page configuration (Admin)
router.get('/landing', requireRole(['ADMIN']), requireTenant, async (req, res) => {
  const tid = (req as any).tenantId as number;
  const defaults: LandingConfig = {
    heroTitle: 'Connect, organize, and grow your church community',
    heroSubtitle: 'A modern, secure church management system that streamlines membership, events, communication, and reporting — accessible anywhere.',
    ctaMemberLabel: 'Member Login',
    ctaAdminLabel: 'Admin Login',
    features: [
      { title: 'Unified Dashboard', description: 'Clear insights into membership, finance, events, sermons, and attendance.', icon: '📊' },
      { title: 'Smart Member Management', description: 'Import, segment, and track member growth and participation.', icon: '🗂️' },
      { title: 'Communication Tools', description: 'Announcements, SMS, and suggestion box to keep everyone connected.', icon: '📣' },
    ],
    testimonials: [
      { quote: '“FaithConnect helped us centralize our operations and engage our members more meaningfully.”', author: 'Church Administrator' },
      { quote: '“The dashboard and attendance tracking saved hours every week.”', author: 'Pastoral Team' },
    ],
    heroImagePath: '',
    links: { features: '#features', testimonials: '#testimonials', getStarted: '#cta' },
  };
  const cfg = await getSetting<LandingConfig>('landing_config', defaults, tid);
  res.json(cfg || defaults);
});

router.put('/landing', requireRole(['ADMIN']), requireTenant, async (req, res) => {
  const tid = (req as any).tenantId as number;
  const incoming = req.body as Partial<LandingConfig>;
  const prev = await getSetting<LandingConfig>('landing_config', {
    heroTitle: '',
    heroSubtitle: '',
    ctaMemberLabel: 'Member Login',
    ctaAdminLabel: 'Admin Login',
    features: [],
    testimonials: [],
    heroImagePath: '',
    links: { features: '#features', testimonials: '#testimonials', getStarted: '#cta' },
  }, tid);
  const next = {
    heroTitle: typeof incoming.heroTitle === 'string' ? incoming.heroTitle : prev.heroTitle || '',
    heroSubtitle: typeof incoming.heroSubtitle === 'string' ? incoming.heroSubtitle : prev.heroSubtitle || '',
    ctaMemberLabel: typeof incoming.ctaMemberLabel === 'string' ? incoming.ctaMemberLabel : prev.ctaMemberLabel || 'Member Login',
    ctaAdminLabel: typeof incoming.ctaAdminLabel === 'string' ? incoming.ctaAdminLabel : prev.ctaAdminLabel || 'Admin Login',
    features: Array.isArray(incoming.features) ? incoming.features.slice(0,3) : (Array.isArray(prev.features) ? prev.features : []),
    testimonials: Array.isArray(incoming.testimonials) ? incoming.testimonials.slice(0,2) : (Array.isArray(prev.testimonials) ? prev.testimonials : []),
    heroImagePath: typeof incoming.heroImagePath === 'string' ? incoming.heroImagePath : prev.heroImagePath || '',
    links: (incoming.links && typeof incoming.links === 'object')
      ? {
          features: String((incoming.links as any).features || prev.links?.features || '#features'),
          testimonials: String((incoming.links as any).testimonials || prev.links?.testimonials || '#testimonials'),
          getStarted: String((incoming.links as any).getStarted || prev.links?.getStarted || '#cta'),
        }
      : (prev.links || { features: '#features', testimonials: '#testimonials', getStarted: '#cta' }),
  };
  await setSetting('landing_config', next, tid);
  try {
    const user = (req as any).user;
    if (user?.id) await prisma.auditLog.create({ data: { userId: user.id, action: 'LANDING_UPDATED', entityType: 'Setting', entityId: 0, tenant: { connect: { id: tid } } } });
  } catch {}
  res.json({ status: 'ok' });
});

// Upload landing hero image
const landingDir = path.join(__dirname, '../../uploads/landing');
const landingStorage = multer.diskStorage({
  destination: (_req: any, _file: any, cb: any) => {
    fs.mkdirSync(landingDir, { recursive: true });
    cb(null, landingDir);
  },
  filename: (req: any, file: any, cb: any) => {
    const tid = (req as any).tenantId || 'tenant';
    const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
    cb(null, `tenant-${tid}-landing-${Date.now()}${ext}`);
  }
});
const uploadLanding = multer({ storage: landingStorage });

router.post('/landing/image', requireRole(['ADMIN']), requireTenant, uploadLanding.single('image'), async (req, res) => {
  const tid = (req as any).tenantId as number;
  const file = (req as any).file as any;
  if (!file) return res.status(400).json({ message: 'No image uploaded' });
  const rel = `landing/${file.filename}`;
  const prev = await getSetting<LandingConfig>('landing_config', {
    heroTitle: '',
    heroSubtitle: '',
    ctaMemberLabel: 'Member Login',
    ctaAdminLabel: 'Admin Login',
    features: [],
    testimonials: [],
    heroImagePath: '',
  }, tid);
  const next = { ...(prev || {}), heroImagePath: rel };
  await setSetting('landing_config', next, tid);
  res.status(201).json({ path: rel });
});

// Spiritual statuses configuration
router.get('/spiritual-statuses', requireTenant, async (req, res) => {
  const defaults = ['New Convert','Visitor','Member','Committed','Worker','Baptized','Dedicated','Backsliding','Restored'];
  try {
    const tid = (req as any).tenantId as number;
    const s = await prisma.setting.findFirst({ where: { tenantId: tid, key: 'spiritual_statuses' } });
    const list = s ? JSON.parse(s.value) : defaults;
    res.json(Array.isArray(list) ? list : defaults);
  } catch {
    res.json(defaults);
  }
});

router.post('/spiritual-statuses', requireRole(['ADMIN','CLERK']), requireTenant, async (req, res) => {
  const { statuses } = req.body as { statuses: string[] };
  if (!Array.isArray(statuses) || statuses.length === 0) return res.status(400).json({ message: 'Provide non-empty array of statuses' });
  const value = JSON.stringify(statuses);
  const tid = (req as any).tenantId as number;
  const exists = await prisma.setting.findFirst({ where: { tenantId: tid, key: 'spiritual_statuses' } });
  if (exists) await prisma.setting.update({ where: { id: exists.id }, data: { value } });
  else await prisma.setting.create({ data: { key: 'spiritual_statuses', value, tenantId: tid } });
  res.json({ status: 'ok', count: statuses.length });
});

// List all editable titles (keys starting with title_)
router.get('/titles', requireRole(['ADMIN','CLERK','PASTOR']), requireTenant, async (req, res) => {
  try {
    const tid = (req as any).tenantId as number;
    const rows = await prisma.setting.findMany({ where: { tenantId: tid, key: { startsWith: 'title_' } } });
    const list = rows.map(r => {
      let v = '';
      try { v = JSON.parse(r.value); } catch { v = r.value; }
      const k = r.key.replace(/^title_/, '');
      return { key: k, value: String(v || '') };
    });
    res.json(list);
  } catch (e: any) {
    res.status(500).json({ message: e?.message || 'Failed to load titles' });
  }
});

// Generic editable titles per section
router.get('/titles/:key', authenticate, requireTenant, async (req, res) => {
  const { key } = req.params as { key: string };
  const tid = (req as any).tenantId as number;
  const s = await prisma.setting.findFirst({ where: { tenantId: tid, key: `title_${key}` } });
  let value = '';
  try { value = s ? JSON.parse(s.value) : ''; } catch { value = s?.value || ''; }
  res.json({ key, value });
});

// Membership statuses configuration
router.get('/membership-statuses', requireTenant, async (req, res) => {
  const defaults = ['Active Member','Dormant','Inactive','Transferred','Visitor','Suspended'];
  try {
    const tid = (req as any).tenantId as number;
    const s = await prisma.setting.findFirst({ where: { tenantId: tid, key: 'membership_statuses' } });
    const list = s ? JSON.parse(s.value) : defaults;
    res.json(Array.isArray(list) ? list : defaults);
  } catch {
    res.json(defaults);
  }
});

router.post('/membership-statuses', requireRole(['ADMIN','CLERK']), requireTenant, async (req, res) => {
  const { statuses } = req.body as { statuses: string[] };
  if (!Array.isArray(statuses) || statuses.length === 0) return res.status(400).json({ message: 'Provide non-empty array of statuses' });
  const value = JSON.stringify(statuses);
  const tid = (req as any).tenantId as number;
  const exists = await prisma.setting.findFirst({ where: { tenantId: tid, key: 'membership_statuses' } });
  if (exists) await prisma.setting.update({ where: { id: exists.id }, data: { value } });
  else await prisma.setting.create({ data: { key: 'membership_statuses', value, tenantId: tid } });
  res.json({ status: 'ok', count: statuses.length });
});

// Role-based action permissions (Admin configures what Clerks/Pastors can add)
router.get('/role-permissions', requireRole(['ADMIN','CLERK','PASTOR']), requireTenant, async (req, res) => {
  const defaults = {
    CLERK: {
      add_members: true,
      add_events: true,
      add_announcements: true,
      add_councils: true,
      add_committees: true,
      add_finance: true,
    },
    PASTOR: {
      add_members: true,
      add_events: true,
      add_announcements: true,
      add_councils: true,
      add_committees: true,
      add_finance: false, // pastors cannot add finance by default
    },
  } as Record<string, Record<string, boolean>>;
  try {
    const tid = (req as any).tenantId as number;
    const s = await prisma.setting.findFirst({ where: { tenantId: tid, key: 'role_permissions' } });
    const val = s ? JSON.parse(s.value) : defaults;
    res.json(val || defaults);
  } catch {
    res.json(defaults);
  }
});

router.post('/role-permissions', requireRole(['ADMIN']), requireTenant, async (req, res) => {
  const config = req.body as Record<string, Record<string, boolean>>;
  if (!config || typeof config !== 'object') return res.status(400).json({ message: 'Invalid configuration payload' });
  const str = JSON.stringify(config);
  const tid = (req as any).tenantId as number;
  const exists = await prisma.setting.findFirst({ where: { tenantId: tid, key: 'role_permissions' } });
  if (exists) await prisma.setting.update({ where: { id: exists.id }, data: { value: str } });
  else await prisma.setting.create({ data: { key: 'role_permissions', value: str, tenantId: tid } });
  res.json({ status: 'ok' });
});

router.put('/titles/:key', requireRole(['ADMIN']), requireTenant, async (req, res) => {
  const { key } = req.params as { key: string };
  const { value } = req.body as { value: string };
  const val = (value || '').trim();
  if (!val) return res.status(400).json({ message: 'value required' });
  if (val.length > 50) return res.status(400).json({ message: 'value must be ≤ 50 characters' });
  const str = JSON.stringify(val);
  const settingKey = `title_${key}`;
  const tid = (req as any).tenantId as number;
  const exists = await prisma.setting.findFirst({ where: { tenantId: tid, key: settingKey } });
  const prev = exists ? exists.value : null;
  if (exists) await prisma.setting.update({ where: { id: exists.id }, data: { value: str } });
  else await prisma.setting.create({ data: { key: settingKey, value: str, tenantId: tid } });
  try {
    const user = (req as any).user;
    if (user?.id) {
      await prisma.auditLog.create({ data: { userId: user.id, action: 'TITLE_UPDATED', entityType: 'Setting', entityId: 0, tenant: { connect: { id: tid } } } });
    }
  } catch {}
  res.json({ status: 'ok', key, value: val });
});

// Create or upsert a custom title key
router.post('/titles', requireRole(['ADMIN']), requireTenant, async (req, res) => {
  const { key, value } = req.body as { key: string; value: string };
  const k = String(key || '').trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,32}$/.test(k)) return res.status(400).json({ message: 'Invalid key (use letters, numbers, - or _; 2–32 chars)' });
  const val = (value || '').trim();
  if (!val) return res.status(400).json({ message: 'value required' });
  if (val.length > 50) return res.status(400).json({ message: 'value must be ≤ 50 characters' });
  const settingKey = `title_${k}`;
  const str = JSON.stringify(val);
  const tid = (req as any).tenantId as number;
  const exists = await prisma.setting.findFirst({ where: { tenantId: tid, key: settingKey } });
  if (exists) await prisma.setting.update({ where: { id: exists.id }, data: { value: str } });
  else await prisma.setting.create({ data: { key: settingKey, value: str, tenantId: tid } });
  res.json({ status: 'ok', key: k, value: val });
});

// Delete a title key
router.delete('/titles/:key', requireRole(['ADMIN']), requireTenant, async (req, res) => {
  const { key } = req.params as { key: string };
  const k = String(key || '').trim().toLowerCase();
  const settingKey = `title_${k}`;
  const tid = (req as any).tenantId as number;
  const exists = await prisma.setting.findFirst({ where: { tenantId: tid, key: settingKey } });
  if (!exists) return res.status(404).json({ message: 'Title key not found' });
  await prisma.setting.delete({ where: { id: exists.id } });
  res.json({ status: 'deleted', key: k });
});

// Basic version history for titles keyed by audit logs
router.get('/titles/:key/history', requireRole(['ADMIN']), requireTenant, async (req, res) => {
  const { key } = req.params as { key: string };
  const settingKey = `title_${key}`;
  try {
    const tid = (req as any).tenantId as number;
    const s = await prisma.setting.findFirst({ where: { tenantId: tid, key: settingKey } });
    if (!s) return res.json({ key, history: [] });
    const latest = { id: 0, userId: 0, createdAt: (s.updatedAt as any), prev: null, next: s.value };
    res.json({ key, history: [latest] });
  } catch (e: any) {
    res.status(500).json({ message: e?.message || 'Failed to load history' });
  }
});

function safeJson(s: any): any {
  try { return JSON.parse(typeof s === 'string' ? s : String(s)); } catch { return null; }
}

export default router;
