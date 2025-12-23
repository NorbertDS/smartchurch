"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireFeature = requireFeature;
const features_1 = require("../core/features");
function requireFeature(feature) {
    return (req, res, next) => {
        const tenant = req.tenant;
        const sub = req.subscription;
        const enabled = (0, features_1.computeTenantFeatures)({ plan: sub?.plan, tenantConfig: tenant?.config });
        if (!enabled[feature])
            return res.status(403).json({ message: `Feature disabled: ${feature}` });
        next();
    };
}
