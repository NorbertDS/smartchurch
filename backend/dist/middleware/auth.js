"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
exports.requireRole = requireRole;
exports.requirePermission = requirePermission;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = require("../config/prisma");
function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Missing Authorization header' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'changeme-super-secret-key');
        req.user = decoded;
        next();
    }
    catch (err) {
        return res.status(401).json({ message: 'Invalid token' });
    }
}
function requireRole(roles) {
    return (req, res, next) => {
        const user = req.user;
        if (!user)
            return res.status(401).json({ message: 'Unauthenticated' });
        if (!roles.includes(user.role))
            return res.status(403).json({ message: 'Forbidden' });
        next();
    };
}
// Dynamic permission check controlled via Settings → role_permissions (JSON)
// Structure:
// {
//   "CLERK": { "add_members": true, "add_events": true, ... },
//   "PASTOR": { "add_members": false, ... }
// }
function requirePermission(actionKey) {
    return async (req, res, next) => {
        const user = req.user;
        if (!user)
            return res.status(401).json({ message: 'Unauthenticated' });
        if (user.role === 'ADMIN')
            return next();
        try {
            const tid = req.tenantId;
            const s = tid
                ? await prisma_1.prisma.setting.findUnique({ where: { tenantId_key: { tenantId: tid, key: 'role_permissions' } } })
                : await prisma_1.prisma.setting.findFirst({ where: { key: 'role_permissions' } });
            let cfg = null;
            try {
                cfg = s ? JSON.parse(s.value) : null;
            }
            catch {
                cfg = null;
            }
            const roleCfg = (cfg && typeof cfg === 'object') ? cfg[user.role] : null;
            const allowed = roleCfg && Object.prototype.hasOwnProperty.call(roleCfg, actionKey)
                ? !!roleCfg[actionKey]
                : true; // default allow unless explicitly disabled
            if (!allowed)
                return res.status(403).json({ message: 'Action disabled by admin policy' });
            next();
        }
        catch (e) {
            // On settings read failure, default to allow to avoid hard lock; log could be added
            next();
        }
    };
}
