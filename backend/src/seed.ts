import 'dotenv/config';
import { prisma } from './config/prisma';
import bcrypt from 'bcryptjs';

async function main() {
  console.log('Seeding data...');
  // Ensure a default tenant for dev
  const tenantSlug = 'dev-church';
  const tenantName = 'Dev Church';
  let tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) {
    tenant = await prisma.tenant.create({ data: { name: tenantName, slug: tenantSlug, status: 'ACTIVE' } });
    console.log(`Created tenant: ${tenantName} (${tenantSlug})`);
  }
  const adminEmail = 'admin@faithconnect.local';
  const admin = await prisma.user.findFirst({ where: { email: adminEmail, tenantId: tenant.id } });
  const desiredPassword = 'Admin123!';
  const desiredHash = await bcrypt.hash(desiredPassword, 10);
  if (!admin) {
    await prisma.user.create({ data: { name: 'Admin', email: adminEmail, passwordHash: desiredHash, role: 'ADMIN', tenantId: tenant.id } });
    console.log(`Admin user created: ${adminEmail} / ${desiredPassword}`);
  } else {
    // Ensure the known dev password to avoid login confusion
    await prisma.user.update({ where: { id: admin.id }, data: { passwordHash: desiredHash } });
    console.log(`Admin password reset to: ${adminEmail} / ${desiredPassword}`);
  }

  const departments = [
    { name: 'Pastorate', description: 'Church elders' },
    { name: 'Church Choir' },
    { name: 'Deaconry' },
    { name: 'Youth' },
    { name: 'AWM', description: 'All Women Department' },
    { name: 'AMM', description: 'All Men Department' },
    { name: 'Children' },
    { name: 'Communication', description: 'Digital (livestreaming and media) and technical' },
  ];
  for (const d of departments) {
    const exists = await prisma.department.findFirst({ where: { name: d.name, tenantId: tenant.id } });
    if (exists) {
      await prisma.department.update({ where: { id: exists.id }, data: { description: d.description, tenantId: tenant.id } });
    } else {
      await prisma.department.create({ data: { name: d.name, description: d.description, tenantId: tenant.id } });
    }
  }

  const memberCount = await prisma.member.count({ where: { tenantId: tenant.id } });
  if (memberCount === 0) {
    await prisma.member.create({ data: { firstName: 'John', lastName: 'Doe', gender: 'MALE', contact: '555-0001', address: '123 Main St', spiritualStatus: 'Baptized', tenantId: tenant.id } });
    await prisma.member.create({ data: { firstName: 'Mary', lastName: 'Smith', gender: 'FEMALE', contact: '555-0002', address: '42 Grace Rd', spiritualStatus: 'New Convert', tenantId: tenant.id } });
  }

  const upcomingEvent = await prisma.event.findFirst({ where: { title: 'Sunday Service', tenantId: tenant.id } });
  if (!upcomingEvent) {
    await prisma.event.create({ data: { title: 'Sunday Service', description: 'Weekly worship', date: new Date(Date.now() + 7*24*60*60*1000), location: 'Main Sanctuary', tenantId: tenant.id } });
  }

  console.log('Seeding done.');
}

main().catch(e => {
  console.error(e);
}).finally(async () => {
  await prisma.$disconnect();
});
