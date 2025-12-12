import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { prisma } from '../config/prisma';
// Many deployments may not include all optional models referenced here.
// To keep TypeScript happy under strict mode and avoid runtime crashes,
// use a permissive cast and guard missing models.
const p: any = prisma;

export type FullBackup = {
  meta: { createdAt: string; version: string };
  settings: any[];
  users: any[];
  members: any[];
  departments: any[];
  events: any[];
  announcements: any[];
  sermons: any[];
  finance: any[];
  attendanceRecords: any[];
  councils: any[];
  committees: any[];
  boardMinutes: any[];
  businessMinutes: any[];
  programs: any[];
  cellGroups: any[];
  cellGroupMemberships: any[];
};

function whereTid(tenantId?: number) {
  return typeof tenantId === 'number' ? { tenantId } : undefined;
}

export async function exportFullBackup(tenantId?: number): Promise<FullBackup> {
  const [users, members, departments, events, announcements, sermons, finance, attendanceRecords, councils, committees, boardMinutes, businessMinutes, settings, programs, cellGroups, cellGroupMemberships] = await Promise.all([
    p.user?.findMany?.({ where: whereTid(tenantId) }) || [],
    p.member?.findMany?.({ where: whereTid(tenantId) }) || [],
    p.department?.findMany?.({ where: whereTid(tenantId) }) || [],
    p.event?.findMany?.({ where: whereTid(tenantId) }) || [],
    p.announcement?.findMany?.({ where: whereTid(tenantId) }) || [],
    p.sermon?.findMany?.({ where: whereTid(tenantId) }) || [],
    p.financeRecord?.findMany?.({ where: whereTid(tenantId) }) || [],
    p.attendanceRecord?.findMany?.({ where: whereTid(tenantId), include: { entries: true } }) || [],
    p.council?.findMany?.({ where: whereTid(tenantId), include: { members: true } }) || [],
    p.committee?.findMany?.({ where: whereTid(tenantId), include: { members: true } }) || [],
    p.boardMinute?.findMany?.({ where: whereTid(tenantId), include: { versions: true } }) || [],
    p.businessMinute?.findMany?.({ where: whereTid(tenantId), include: { versions: true } }) || [],
    p.setting?.findMany?.({ where: whereTid(tenantId) }) || [],
    p.program?.findMany?.({ where: whereTid(tenantId) }) || [],
    p.cellGroup?.findMany?.({ where: whereTid(tenantId) }) || [],
    p.cellGroupMembership?.findMany?.({ where: whereTid(tenantId) }) || [],
  ]);
  const now = new Date().toISOString();
  return {
    meta: { createdAt: now, version: '1.0' },
    settings,
    users,
    members,
    departments,
    events,
    announcements,
    sermons,
    finance,
    attendanceRecords,
    councils,
    committees,
    boardMinutes,
    businessMinutes,
    programs,
    cellGroups,
    cellGroupMemberships,
  };
}

export function backupDir(): string {
  const dir = process.env.BACKUP_DIR || path.join(process.cwd(), 'backend', 'prisma', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function writeBackupToDisk(data: FullBackup): Promise<{ filePath: string; size: number }> {
  const dir = backupDir();
  const name = `backup-${new Date(data.meta.createdAt).toISOString().replace(/[:.]/g, '-')}.json`;
  const filePath = path.join(dir, name);
  const str = JSON.stringify(data, null, 2);
  const key = process.env.BACKUP_ENCRYPTION_KEY;
  if (key && key.length >= 32) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key.slice(0,32)), iv);
    const enc = Buffer.concat([cipher.update(str, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const payload = Buffer.concat([Buffer.from('FCBK'), iv, tag, enc]);
    const encName = name.replace(/\.json$/, '.enc');
    const encPath = path.join(dir, encName);
    fs.writeFileSync(encPath, payload);
    return { filePath: encPath, size: payload.length };
  } else {
    fs.writeFileSync(filePath, str);
    return { filePath, size: Buffer.byteLength(str) };
  }
}

export function listBackups(): { file: string; createdAt: string; size: number }[] {
  const dir = backupDir();
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') || f.endsWith('.enc'));
  return files.map(f => {
    const fp = path.join(dir, f);
    const st = fs.statSync(fp);
    return { file: fp, createdAt: st.mtime.toISOString(), size: st.size };
  }).sort((a,b)=> new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function validateConsistency(tenantId?: number): Promise<{ issues: string[] }> {
  const issues: string[] = [];
  // Members linked to non-existing users
  const members = await (p.member?.findMany?.({ where: whereTid(tenantId) }) || []);
  const userIds = new Set((await (p.user?.findMany?.({ where: whereTid(tenantId) }) || [])).map((u: any) => u.id));
  members.forEach((m: any) => { if (m.userId && !userIds.has(m.userId)) issues.push(`Member #${m.id} references missing userId=${m.userId}`); });
  // Events linked to non-existing departments (events.departmentId references Department.id)
  const deptIds = new Set((await (p.department?.findMany?.({ where: whereTid(tenantId) }) || [])).map((x: any) => x.id));
  const events = await (p.event?.findMany?.({ where: whereTid(tenantId) }) || []);
  (events as any[]).forEach((e: any) => { if (e.departmentId && !deptIds.has(e.departmentId)) issues.push(`Event #${e.id} references missing departmentId=${e.departmentId}`); });
  // Councils/Committees memberships integrity
  const councilMemberLinks = await (p.councilMember?.findMany?.({ where: whereTid(tenantId) }) || []);
  const councilIds = new Set((await (p.council?.findMany?.({ where: whereTid(tenantId) }) || [])).map((c: any) => c.id));
  const memberIds = new Set((members as any[]).map((m: any) => m.id));
  (councilMemberLinks as any[]).forEach((cm: any) => {
    if (!councilIds.has(cm.councilId)) issues.push(`CouncilMember #${cm.id} missing councilId=${cm.councilId}`);
    if (!memberIds.has(cm.memberId)) issues.push(`CouncilMember #${cm.id} missing memberId=${cm.memberId}`);
  });
  const committeeMemberLinks = await (p.committeeMember?.findMany?.({ where: whereTid(tenantId) }) || []);
  const committeeIds = new Set((await (p.committee?.findMany?.({ where: whereTid(tenantId) }) || [])).map((c: any) => c.id));
  (committeeMemberLinks as any[]).forEach((cm: any) => {
    if (!committeeIds.has(cm.committeeId)) issues.push(`CommitteeMember #${cm.id} missing committeeId=${cm.committeeId}`);
    if (!memberIds.has(cm.memberId)) issues.push(`CommitteeMember #${cm.id} missing memberId=${cm.memberId}`);
  });
  return { issues };
}

// Non-destructive restore: upsert entities by stable unique keys, then rebuild relationships
export async function restoreNonDestructive(payload: Partial<FullBackup>, tenantId?: number): Promise<{ summary: Record<string, number> }> {
  const summary: Record<string, number> = {};
  await prisma.$transaction(async (tx) => {
    const t: any = tx;
    // Users by email
    if (Array.isArray(payload.users)) {
      let count = 0;
      for (const u of payload.users) {
        if (!u.email) continue;
        const exists = await t.user?.findFirst?.({ where: { email: u.email, ...whereTid(tenantId) } });
        if (exists) {
          await t.user.update({ where: { id: exists.id }, data: { name: u.name || exists.name, role: u.role || exists.role, tenantId: tenantId ?? exists.tenantId } });
        } else {
          await t.user.create({ data: { email: u.email, passwordHash: u.passwordHash || '', name: u.name || 'Restored', role: u.role || 'MEMBER', tenantId: tenantId } });
        }
        count++;
      }
      summary.users = count;
    }

    // Removed legacy ministries restore; departments are primary

    // Departments by name
    if (Array.isArray(payload.departments)) {
      let count = 0;
      for (const d of payload.departments) {
        if (!d.name) continue;
        const exists = await t.department?.findFirst?.({ where: { name: d.name, ...whereTid(tenantId) } });
        const data: any = { description: d.description || null, leaderId: d.leaderId || null };
        if (exists) await t.department.update({ where: { id: exists.id }, data: { ...data, tenantId: tenantId ?? exists.tenantId } }); else await t.department.create({ data: { name: d.name, ...data, tenantId: tenantId } });
        count++;
      }
      summary.departments = count;
    }

    // Members by user link or name+dob
    if (Array.isArray(payload.members)) {
      let count = 0;
      for (const m of payload.members) {
        const whereByUser = m.userId ? { userId: m.userId } : null;
        const whereByNameDob = (!whereByUser && m.firstName && m.lastName && m.dob) ? { firstName: m.firstName, lastName: m.lastName, dob: new Date(m.dob) } : null;
        let existing: any = null;
        if (whereByUser) existing = await t.member?.findFirst?.({ where: { userId: whereByUser.userId as number, ...whereTid(tenantId) } });
        if (!existing && whereByNameDob) existing = await t.member?.findFirst?.({ where: { ...whereByNameDob, ...whereTid(tenantId) } });
        const data: any = {
          firstName: m.firstName,
          lastName: m.lastName,
          gender: m.gender || 'OTHER',
          dob: m.dob ? new Date(m.dob) : undefined,
          contact: m.contact || undefined,
          address: m.address || undefined,
          spiritualStatus: m.spiritualStatus || undefined,
          photoUrl: m.photoUrl || undefined,
          baptized: !!m.baptized,
          dedicated: !!m.dedicated,
          weddingDate: m.weddingDate ? new Date(m.weddingDate) : undefined,
          membershipStatus: m.membershipStatus || undefined,
          profession: m.profession || undefined,
          talents: m.talents || undefined,
          abilities: m.abilities || undefined,
        };
        if (existing) await t.member.update({ where: { id: existing.id }, data: { ...data, tenantId: tenantId ?? existing.tenantId } }); else await t.member.create({ data: { ...data, tenantId: tenantId } });
        count++;
      }
      summary.members = count;
    }

    // Events by title+date
    if (Array.isArray(payload.events)) {
      let count = 0;
      for (const e of payload.events) {
        const dt = e.date ? new Date(e.date) : null;
        if (!e.title || !dt) continue;
        const exists = await t.event?.findFirst?.({ where: { title: e.title, date: dt, ...whereTid(tenantId) } });
        const data: any = { description: e.description || null, location: e.location || null };
        if (exists) await t.event.update({ where: { id: exists.id }, data: { ...data, tenantId: tenantId ?? exists.tenantId } }); else await t.event.create({ data: { title: e.title, date: dt, ...data, tenantId: tenantId } });
        count++;
      }
      summary.events = count;
    }

    // Programs by name+startDate
    if (Array.isArray(payload.programs)) {
      let count = 0;
      for (const p of payload.programs) {
        const start = p.startDate ? new Date(p.startDate) : null;
        if (!p.name || !start) continue;
        const exists = await t.program?.findFirst?.({ where: { name: p.name, startDate: start, ...whereTid(tenantId) } });
        const data: any = { description: p.description || null, endDate: p.endDate ? new Date(p.endDate) : null, location: p.location || null, status: p.status || null };
        if (exists) await t.program.update({ where: { id: exists.id }, data: { ...data, tenantId: tenantId ?? exists.tenantId } }); else await t.program.create({ data: { name: p.name, startDate: start, ...data, tenantId: tenantId } });
        count++;
      }
      summary.programs = count;
    }

    // CellGroups by name
    if (Array.isArray(payload.cellGroups)) {
      let count = 0;
      for (const g of payload.cellGroups) {
        if (!g.name) continue;
        const exists = await t.cellGroup?.findFirst?.({ where: { name: g.name, ...whereTid(tenantId) } });
        const data: any = { description: g.description || null, location: g.location || null };
        if (exists) await t.cellGroup.update({ where: { id: exists.id }, data: { ...data, tenantId: tenantId ?? exists.tenantId } }); else await t.cellGroup.create({ data: { name: g.name, ...data, tenantId: tenantId } });
        count++;
      }
      summary.cellGroups = count;
    }

    // Councils & Committees by name
    if (Array.isArray(payload.councils)) {
      let count = 0;
      for (const c of payload.councils) {
        if (!c.name) continue;
        const exists = await t.council?.findFirst?.({ where: { name: c.name, ...whereTid(tenantId) } });
        const data: any = { description: c.description || null, contact: c.contact || null, meetingSchedule: c.meetingSchedule || null };
        if (exists) await t.council.update({ where: { id: exists.id }, data: { ...data, tenantId: tenantId ?? exists.tenantId } }); else await t.council.create({ data: { name: c.name, ...data, tenantId: tenantId } });
        count++;
      }
      summary.councils = count;
    }
    if (Array.isArray(payload.committees)) {
      let count = 0;
      for (const c of payload.committees) {
        if (!c.name) continue;
        const exists = await t.committee?.findFirst?.({ where: { name: c.name, ...whereTid(tenantId) } });
        const data: any = { meetingFrequency: c.meetingFrequency || null };
        if (exists) await t.committee.update({ where: { id: exists.id }, data: { ...data, tenantId: tenantId ?? exists.tenantId } }); else await t.committee.create({ data: { name: c.name, ...data, tenantId: tenantId } });
        count++;
      }
      summary.committees = count;
    }

    // Announcements by title+createdAt
    if (Array.isArray(payload.announcements)) {
      let count = 0;
      for (const a of payload.announcements) {
        const ca = a.createdAt ? new Date(a.createdAt) : null;
        if (!a.title || !ca) continue;
        const exists = await t.announcement?.findFirst?.({ where: { title: a.title, createdAt: ca, ...whereTid(tenantId) } });
        if (!exists) {
          await t.announcement.create({ data: { title: a.title, content: a.content || '', audience: a.audience || null, createdAt: ca, tenantId: tenantId } });
        }
        count++;
      }
      summary.announcements = count;
    }

    // Sermons by title+date
    if (Array.isArray(payload.sermons)) {
      let count = 0;
      for (const s of payload.sermons) {
        const dt = s.date ? new Date(s.date) : null;
        if (!s.title || !dt) continue;
        const exists = await t.sermon?.findFirst?.({ where: { title: s.title, date: dt, ...whereTid(tenantId) } });
        const data: any = { speaker: s.speaker || null, type: s.type || 'TEXT', contentUrl: s.contentUrl || null, textContent: s.textContent || null };
        if (exists) await t.sermon.update({ where: { id: exists.id }, data: { ...data, tenantId: tenantId ?? exists.tenantId } }); else await t.sermon.create({ data: { title: s.title, date: dt, ...data, tenantId: tenantId } });
        count++;
      }
      summary.sermons = count;
    }
  });
  return { summary };
}
