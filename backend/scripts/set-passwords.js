// Dev-only: reset passwords for known users to standard values
// Usage: node scripts/set-passwords.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const mappings = [
  { email: 'provider.admin@faithconnect.local', password: process.env.PROVIDER_ADMIN_PASSWORD || 'ProviderAdmin123!' },
  { email: 'admin@sda.faithconnect.local', password: 'Admin@123' },
  { email: 'admin@default.faithconnect.local', password: 'Admin@123' },
  { email: 'admin@chch.faithconnect.local', password: 'Admin@123' },
  { email: 'noba@gmail.com', password: 'Member@123' },
  { email: 'test1@tes.com', password: 'Member@123' },
];

(async () => {
  try {
    for (const m of mappings) {
      const user = await prisma.user.findFirst({ where: { email: m.email } });
      if (!user) {
        console.log(`[skip] ${m.email} not found`);
        continue;
      }
      const hash = await bcrypt.hash(m.password, 10);
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } });
      console.log(`[ok] ${m.email} password reset`);
    }
    console.log('Done.');
  } catch (e) {
    console.error('Error:', e?.message || e);
    process.exitCode = 1;
  } finally {
    try { await prisma.$disconnect(); } catch {}
  }
})();

