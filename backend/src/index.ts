import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import { prisma } from './config/prisma';
import bcrypt from 'bcryptjs';

import authRouter from './routes/auth';
import memberRouter from './routes/members';
import departmentsRouter from './routes/departments';
import eventRouter from './routes/events';
import attendanceRouter from './routes/attendance';
import financeRouter from './routes/finance';
import announcementRouter from './routes/announcements';
import sermonRouter from './routes/sermons';
import reportRouter from './routes/reports';
import programsRouter from './routes/programs';
import cellGroupsRouter from './routes/cellGroups';
import aiRouter from './routes/ai';
import paymentsRouter from './routes/payments';
import settingsRouter from './routes/settings';
import minutesRouter from './routes/minutes';
import councilsRouter from './routes/councils';
import committeesRouter from './routes/committees';
import suggestionsRouter from './routes/suggestions';
import qrRouter from './routes/qr';
import smsRouter from './routes/sms';
import publicRouter from './routes/public';
import providerRouter from './routes/provider';
import { exportFullBackup, writeBackupToDisk, validateConsistency } from './services/backup';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Serve uploaded member photos
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok' });
  } catch (e) {
    res.status(500).json({ status: 'error', error: 'DB not reachable' });
  }
});

app.use('/auth', authRouter);
app.use('/members', memberRouter);
app.use('/departments', departmentsRouter);
app.use('/events', eventRouter);
app.use('/attendance', attendanceRouter);
app.use('/finance', financeRouter);
app.use('/announcements', announcementRouter);
app.use('/sermons', sermonRouter);
app.use('/reports', reportRouter);
app.use('/programs', programsRouter);
app.use('/cell-groups', cellGroupsRouter);
app.use('/ai', aiRouter);
app.use('/payments', paymentsRouter);
app.use('/settings', settingsRouter);
app.use('/minutes', minutesRouter);
app.use('/councils', councilsRouter);
app.use('/committees', committeesRouter);
app.use('/suggestions', suggestionsRouter);
app.use('/qr', qrRouter);
app.use('/sms', smsRouter);
app.use('/provider', providerRouter);
// Public endpoints (no auth)
app.use('/', publicRouter);

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(PORT, () => {
  console.log(`FaithConnect backend listening on port ${PORT}`);
  (async () => {
    try {
      const count = await prisma.user.count({ where: { role: 'PROVIDER_ADMIN' } });
      if (count === 0) {
        const email = String(process.env.PROVIDER_ADMIN_EMAIL || 'provider.admin@faithconnect.local').toLowerCase();
        const password = String(process.env.PROVIDER_ADMIN_PASSWORD || 'ProviderAdmin123!');
        const name = String(process.env.PROVIDER_ADMIN_NAME || 'Provider Admin');
        const hash = await bcrypt.hash(password, 10);
        await prisma.user.create({ data: { name, email, passwordHash: hash, role: 'PROVIDER_ADMIN' } });
        console.log(`[Bootstrap] Created provider admin ${email}`);
      }
    } catch (e: any) {
      console.warn('[Bootstrap] Provider admin creation failed', e?.message || e);
    }
  })();
  // Scheduled backups and consistency checks
  const intervalMin = Number(process.env.BACKUP_INTERVAL_MINUTES || 60);
  const intervalMs = Math.max(5, intervalMin) * 60 * 1000;
  try {
    setInterval(async () => {
      try {
        const backup = await exportFullBackup();
        const written = await writeBackupToDisk(backup);
        const { issues } = await validateConsistency();
        console.log(`[Backup] Wrote ${written.filePath} (${written.size} bytes). Issues: ${issues.length}`);
        // Auto-archive expired minutes
        const now = new Date();
        await prisma.boardMinute.updateMany({ where: { expiresAt: { lte: now }, archivedAt: null }, data: { archivedAt: now } });
        await prisma.businessMinute.updateMany({ where: { expiresAt: { lte: now }, archivedAt: null }, data: { archivedAt: now } });
        // Reminder: ensure minutes uploaded for meetings (simple heuristic)
        const since = new Date(); since.setDate(since.getDate() - 30);
        const boardEvents = await prisma.event.findMany({ where: { title: { contains: 'Board' }, date: { gte: since } } });
        for (const ev of boardEvents) {
          const has = await prisma.boardMinute.findFirst({ where: { meetingDate: { gte: new Date(ev.date.getTime() - 7*24*60*60*1000), lte: new Date(ev.date.getTime() + 7*24*60*60*1000) } } });
          if (!has) {
            await prisma.announcement.create({ data: { title: 'Reminder: Board Minutes Submission', content: `Please upload minutes for meeting: ${ev.title} (${ev.date.toDateString()})`, audience: 'Staff', tenantId: (ev as any).tenantId } });
          }
        }
        const businessEvents = await prisma.event.findMany({ where: { title: { contains: 'Business' }, date: { gte: since } } });
        for (const ev of businessEvents) {
          const has = await prisma.businessMinute.findFirst({ where: { meetingDate: { gte: new Date(ev.date.getTime() - 7*24*60*60*1000), lte: new Date(ev.date.getTime() + 7*24*60*60*1000) } } });
          if (!has) {
            await prisma.announcement.create({ data: { title: 'Reminder: Business Minutes Submission', content: `Please upload minutes for meeting: ${ev.title} (${ev.date.toDateString()})`, audience: 'Staff', tenantId: (ev as any).tenantId } });
          }
        }
      } catch (e: any) {
        console.error('[Backup] Failed:', e?.message || e);
      }
    }, intervalMs);
    console.log(`[Backup] Scheduled every ${intervalMin} minutes`);
  } catch (e) {
    console.warn('[Backup] Scheduler init failed', e);
  }
});
