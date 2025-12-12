import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// Simple config endpoint to expose enabled providers and public identifiers
router.get('/config', requireRole(['ADMIN', 'CLERK', 'PASTOR']), (_req, res) => {
  const config = {
    paypal: {
      enabled: !!process.env.PAYPAL_CLIENT_ID,
      clientId: process.env.PAYPAL_CLIENT_ID || null,
    },
    stripe: {
      enabled: !!process.env.STRIPE_PUBLIC_KEY,
      publicKey: process.env.STRIPE_PUBLIC_KEY || null,
    },
    mpesa: {
      enabled: !!process.env.MPESA_SHORTCODE,
      shortcode: process.env.MPESA_SHORTCODE || null,
    },
  };
  res.json(config);
});

// Webhook placeholder: integrate provider-specific verification later
router.post('/webhook/:provider', async (req, res) => {
  const { provider } = req.params as { provider: 'paypal' | 'stripe' | 'mpesa' };
  // TODO: verify signature and process events per provider
  // This stub intentionally acknowledges the webhook without processing
  res.status(200).json({ status: 'received', provider });
});

export default router;
