"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const prisma_1 = require("./config/prisma");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const auth_1 = __importDefault(require("./routes/auth"));
const members_1 = __importDefault(require("./routes/members"));
const departments_1 = __importDefault(require("./routes/departments"));
const events_1 = __importDefault(require("./routes/events"));
const attendance_1 = __importDefault(require("./routes/attendance"));
const finance_1 = __importDefault(require("./routes/finance"));
const announcements_1 = __importDefault(require("./routes/announcements"));
const sermons_1 = __importDefault(require("./routes/sermons"));
const reports_1 = __importDefault(require("./routes/reports"));
const programs_1 = __importDefault(require("./routes/programs"));
const cellGroups_1 = __importDefault(require("./routes/cellGroups"));
const ai_1 = __importDefault(require("./routes/ai"));
const payments_1 = __importDefault(require("./routes/payments"));
const settings_1 = __importDefault(require("./routes/settings"));
const minutes_1 = __importDefault(require("./routes/minutes"));
const councils_1 = __importDefault(require("./routes/councils"));
const committees_1 = __importDefault(require("./routes/committees"));
const suggestions_1 = __importDefault(require("./routes/suggestions"));
const qr_1 = __importDefault(require("./routes/qr"));
const sms_1 = __importDefault(require("./routes/sms"));
const public_1 = __importDefault(require("./routes/public"));
const provider_1 = __importDefault(require("./routes/provider"));
const backup_1 = require("./services/backup");
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use((0, morgan_1.default)('dev'));
// Serve uploaded member photos
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '../uploads')));
app.get('/health', async (_req, res) => {
    try {
        await prisma_1.prisma.$queryRaw `SELECT 1`;
        res.json({ status: 'ok' });
    }
    catch (e) {
        res.status(500).json({ status: 'error', error: 'DB not reachable' });
    }
});
app.use('/auth', auth_1.default);
app.use('/members', members_1.default);
app.use('/departments', departments_1.default);
app.use('/events', events_1.default);
app.use('/attendance', attendance_1.default);
app.use('/finance', finance_1.default);
app.use('/announcements', announcements_1.default);
app.use('/sermons', sermons_1.default);
app.use('/reports', reports_1.default);
app.use('/programs', programs_1.default);
app.use('/cell-groups', cellGroups_1.default);
app.use('/ai', ai_1.default);
app.use('/payments', payments_1.default);
app.use('/settings', settings_1.default);
app.use('/minutes', minutes_1.default);
app.use('/councils', councils_1.default);
app.use('/committees', committees_1.default);
app.use('/suggestions', suggestions_1.default);
app.use('/qr', qr_1.default);
app.use('/sms', sms_1.default);
app.use('/provider', provider_1.default);
// Public endpoints (no auth)
app.use('/', public_1.default);
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(PORT, () => {
    console.log(`FaithConnect backend listening on port ${PORT}`);
    (async () => {
        try {
            const count = await prisma_1.prisma.user.count({ where: { role: 'PROVIDER_ADMIN' } });
            if (count === 0) {
                const email = String(process.env.PROVIDER_ADMIN_EMAIL || 'provider.admin@faithconnect.local').toLowerCase();
                const password = String(process.env.PROVIDER_ADMIN_PASSWORD || 'ProviderAdmin123!');
                const name = String(process.env.PROVIDER_ADMIN_NAME || 'Provider Admin');
                const hash = await bcryptjs_1.default.hash(password, 10);
                await prisma_1.prisma.user.create({ data: { name, email, passwordHash: hash, role: 'PROVIDER_ADMIN' } });
                console.log(`[Bootstrap] Created provider admin ${email}`);
            }
        }
        catch (e) {
            console.warn('[Bootstrap] Provider admin creation failed', e?.message || e);
        }
    })();
    // Scheduled backups and consistency checks
    const intervalMin = Number(process.env.BACKUP_INTERVAL_MINUTES || 60);
    const intervalMs = Math.max(5, intervalMin) * 60 * 1000;
    try {
        setInterval(async () => {
            try {
                const backup = await (0, backup_1.exportFullBackup)();
                const written = await (0, backup_1.writeBackupToDisk)(backup);
                const { issues } = await (0, backup_1.validateConsistency)();
                console.log(`[Backup] Wrote ${written.filePath} (${written.size} bytes). Issues: ${issues.length}`);
                // Auto-archive expired minutes
                const now = new Date();
                await prisma_1.prisma.boardMinute.updateMany({ where: { expiresAt: { lte: now }, archivedAt: null }, data: { archivedAt: now } });
                await prisma_1.prisma.businessMinute.updateMany({ where: { expiresAt: { lte: now }, archivedAt: null }, data: { archivedAt: now } });
                // Reminder: ensure minutes uploaded for meetings (simple heuristic)
                const since = new Date();
                since.setDate(since.getDate() - 30);
                const boardEvents = await prisma_1.prisma.event.findMany({ where: { title: { contains: 'Board' }, date: { gte: since } } });
                for (const ev of boardEvents) {
                    const has = await prisma_1.prisma.boardMinute.findFirst({ where: { meetingDate: { gte: new Date(ev.date.getTime() - 7 * 24 * 60 * 60 * 1000), lte: new Date(ev.date.getTime() + 7 * 24 * 60 * 60 * 1000) } } });
                    if (!has) {
                        await prisma_1.prisma.announcement.create({ data: { title: 'Reminder: Board Minutes Submission', content: `Please upload minutes for meeting: ${ev.title} (${ev.date.toDateString()})`, audience: 'Staff', tenantId: ev.tenantId } });
                    }
                }
                const businessEvents = await prisma_1.prisma.event.findMany({ where: { title: { contains: 'Business' }, date: { gte: since } } });
                for (const ev of businessEvents) {
                    const has = await prisma_1.prisma.businessMinute.findFirst({ where: { meetingDate: { gte: new Date(ev.date.getTime() - 7 * 24 * 60 * 60 * 1000), lte: new Date(ev.date.getTime() + 7 * 24 * 60 * 60 * 1000) } } });
                    if (!has) {
                        await prisma_1.prisma.announcement.create({ data: { title: 'Reminder: Business Minutes Submission', content: `Please upload minutes for meeting: ${ev.title} (${ev.date.toDateString()})`, audience: 'Staff', tenantId: ev.tenantId } });
                    }
                }
            }
            catch (e) {
                console.error('[Backup] Failed:', e?.message || e);
            }
        }, intervalMs);
        console.log(`[Backup] Scheduled every ${intervalMin} minutes`);
    }
    catch (e) {
        console.warn('[Backup] Scheduler init failed', e);
    }
});
