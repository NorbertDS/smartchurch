"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.invalidateUserAuthCache = invalidateUserAuthCache;
exports.invalidateTenantSettingCache = invalidateTenantSettingCache;
exports.authenticate = authenticate;
exports.requireRole = requireRole;
exports.signCsrfTokenForJwt = signCsrfTokenForJwt;
exports.requireCsrf = requireCsrf;
exports.requireReauthToken = requireReauthToken;
exports.requirePermission = requirePermission;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = require("../config/prisma");
const crypto_1 = __importDefault(require("crypto"));
const userCache = new Map();
const settingCache = new Map();
function getUserCacheTtlMs() {
    const v = Number(process.env.AUTH_USER_CACHE_TTL_MS || 30000);
    return Number.isFinite(v) && v >= 0 ? v : 30000;
}
function getSettingCacheTtlMs() {
    const v = Number(process.env.AUTH_SETTING_CACHE_TTL_MS || 30000);
    return Number.isFinite(v) && v >= 0 ? v : 30000;
}
function cachedAuthUser(userId) {
    const ttl = getUserCacheTtlMs();
    const got = userCache.get(userId);
    if (!got)
        return null;
    if (ttl === 0)
        return null;
    if ((Date.now() - got.cachedAt) > ttl) {
        userCache.delete(userId);
        return null;
    }
    return got.user;
}
function setCachedAuthUser(userId, user, userUpdatedAt) {
    if (getUserCacheTtlMs() === 0)
        return;
    if (userCache.size > 5000)
        userCache.clear();
    userCache.set(userId, { user, cachedAt: Date.now(), userUpdatedAtMs: userUpdatedAt.getTime() });
}
function invalidateUserAuthCache(userId) {
    userCache.delete(Number(userId));
}
function invalidateTenantSettingCache(tenantId, key) {
    const tid = typeof tenantId === 'number' ? tenantId : null;
    if (key) {
        settingCache.delete(`${tid ?? 'global'}:${key}`);
        return;
    }
    const prefix = `${tid ?? 'global'}:`;
    for (const k of settingCache.keys()) {
        if (k.startsWith(prefix))
            settingCache.delete(k);
    }
}
async function authenticate(req, res, next) {
    const authHeader = String(req.headers.authorization || '');
    let token = '';
    if (authHeader.startsWith('Bearer '))
        token = authHeader.slice('Bearer '.length).trim();
    if (!token)
        token = String((req.query?.token ?? '') || '').trim();
    if (!token)
        return res.status(401).json({ message: 'Missing Authorization header' });
    try {
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'changeme-super-secret-key');
        const cached = cachedAuthUser(decoded.id);
        if (cached) {
            req.user = cached;
            return next();
        }
        const dbUser = await prisma_1.prisma.user.findUnique({
            where: { id: decoded.id },
            select: { id: true, role: true, name: true, email: true, tenantId: true, updatedAt: true },
        });
        if (!dbUser)
            return res.status(401).json({ message: 'Invalid token' });
        const hydrated = {
            id: dbUser.id,
            role: dbUser.role,
            name: dbUser.name,
            email: dbUser.email,
            tenantId: dbUser.tenantId ?? null,
        };
        setCachedAuthUser(dbUser.id, hydrated, dbUser.updatedAt);
        req.user = hydrated;
        return next();
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
function csrfSecret() {
    return String(process.env.JWT_CSRF_SECRET || process.env.JWT_SECRET || 'changeme-super-secret-key');
}
function signCsrfTokenForJwt(jwtToken) {
    const token = String(jwtToken || '').trim();
    if (!token)
        return '';
    return crypto_1.default.createHmac('sha256', csrfSecret()).update(token).digest('hex');
}
function requireCsrf(req, res, next) {
    const authHeader = String(req.headers.authorization || '');
    if (!authHeader.startsWith('Bearer '))
        return res.status(401).json({ message: 'Missing Authorization header' });
    const jwtToken = authHeader.slice('Bearer '.length).trim();
    if (!jwtToken)
        return res.status(401).json({ message: 'Missing Authorization header' });
    const got = String(req.headers['x-csrf-token'] || '').trim();
    if (!got)
        return res.status(403).json({ message: 'Missing CSRF token. Please sign in again and retry.' });
    const expected = signCsrfTokenForJwt(jwtToken);
    try {
        const ok = crypto_1.default.timingSafeEqual(Buffer.from(expected), Buffer.from(got));
        if (!ok)
            return res.status(403).json({ message: 'Invalid CSRF token. Please refresh and retry.' });
    }
    catch {
        return res.status(403).json({ message: 'Invalid CSRF token. Please refresh and retry.' });
    }
    next();
}
function requireReauthToken(purpose) {
    return (req, res, next) => {
        const user = req.user;
        if (!user)
            return res.status(401).json({ message: 'Unauthenticated' });
        const token = String(req.headers['x-reauth-token'] || '').trim();
        if (!token)
            return res.status(401).json({ message: 'Re-authentication required. Confirm your password to continue.' });
        try {
            const decoded = jsonwebtoken_1.default.verify(token, process.env.REAUTH_JWT_SECRET || process.env.JWT_SECRET || 'changeme-super-secret-key');
            if (!decoded || decoded.purpose !== purpose)
                return res.status(401).json({ message: 'Re-authentication required. Please confirm your password again.' });
            if (Number(decoded.id) !== Number(user.id))
                return res.status(401).json({ message: 'Re-authentication token does not match current user. Please confirm again.' });
            next();
        }
        catch {
            return res.status(401).json({ message: 'Re-authentication required. Please confirm your password again.' });
        }
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
            const tenantKey = typeof tid === 'number' ? tid : null;
            const cacheKey = `${tenantKey ?? 'global'}:role_permissions`;
            const ttl = getSettingCacheTtlMs();
            const now = Date.now();
            let raw = null;
            const cached = settingCache.get(cacheKey);
            if (ttl !== 0 && cached && (now - cached.cachedAt) <= ttl) {
                raw = cached.value;
            }
            else {
                const s = tid
                    ? await prisma_1.prisma.setting.findUnique({ where: { tenantId_key: { tenantId: tid, key: 'role_permissions' } } })
                    : await prisma_1.prisma.setting.findFirst({ where: { key: 'role_permissions' } });
                raw = s ? s.value : null;
                if (ttl !== 0)
                    settingCache.set(cacheKey, { value: raw, cachedAt: now });
            }
            let cfg = null;
            try {
                cfg = raw ? JSON.parse(raw) : null;
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
