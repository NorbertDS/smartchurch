"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
// Simple config endpoint to expose enabled providers and public identifiers
router.get('/config', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), (_req, res) => {
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
    const { provider } = req.params;
    // TODO: verify signature and process events per provider
    // This stub intentionally acknowledges the webhook without processing
    res.status(200).json({ status: 'received', provider });
});
exports.default = router;
