import { Router } from 'express';
import { prisma } from '../config/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { sendBulkSms } from '../services/sms';

const router = Router();

router.use(authenticate);

// POST /sms/send
// Body: { message: string; audience?: 'ALL'|'MEMBER_IDS'; ids?: number[] }
router.post('/send', requireRole(['ADMIN','CLERK','PASTOR']), async (req, res) => {
  const { message, audience, ids } = req.body as { message?: string; audience?: 'ALL'|'MEMBER_IDS'; ids?: number[] };
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ message: 'Message is required' });
  }
  let numbers: string[] = [];
  try {
    if (audience === 'MEMBER_IDS' && Array.isArray(ids) && ids.length > 0) {
      const members = await prisma.member.findMany({ where: { id: { in: ids }, deletedAt: null } });
      numbers = members.map(m => m.contact || '').filter(Boolean);
    } else {
      const members = await prisma.member.findMany({ where: { deletedAt: null } });
      numbers = members.map(m => m.contact || '').filter(Boolean);
    }
    if (!numbers.length) {
      return res.status(400).json({ message: 'No valid member contacts found' });
    }
    const result = await sendBulkSms(numbers, message.trim());
    // Audit log entry for traceability
    try {
      await prisma.auditLog.create({ data: { userId: (req as any).user.id, action: `SMS_SENT:${result.sent}/${result.failed}`, entityType: 'System' } });
    } catch {}
    res.json({ status: 'ok', ...result });
  } catch (e: any) {
    res.status(500).json({ message: 'Failed to send SMS', error: e?.message || String(e) });
  }
});

export default router;

