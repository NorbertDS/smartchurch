// Utility script: print users (email and role) to stdout
// Usage: node scripts/list-users.js
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    const users = await prisma.user.findMany({ select: { email: true, role: true, tenantId: true } });
    const tenantIds = Array.from(new Set(users.map(u => u.tenantId).filter(id => typeof id === 'number')));
    const tenants = await prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, slug: true, name: true } });
    const tmap = new Map(tenants.map(t => [t.id, { slug: t.slug, name: t.name }]));
    const output = users.map(u => ({ email: u.email, role: u.role, tenant: u.tenantId ? (tmap.get(u.tenantId)?.slug || String(u.tenantId)) : 'provider' }));
    console.log(JSON.stringify(output, null, 2));
  } catch (e) {
    console.error(e?.message || e);
    process.exitCode = 1;
  } finally {
    try { await prisma.$disconnect(); } catch {}
  }
})();
