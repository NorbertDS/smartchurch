"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const prisma_1 = require("./config/prisma");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
async function main() {
    console.log('Seeding data...');
    // Ensure a default tenant for dev
    const tenantSlug = 'dev-church';
    const tenantName = 'Dev Church';
    let tenant = await prisma_1.prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) {
        tenant = await prisma_1.prisma.tenant.create({ data: { name: tenantName, slug: tenantSlug, status: 'ACTIVE' } });
        console.log(`Created tenant: ${tenantName} (${tenantSlug})`);
    }
    const adminEmail = 'admin@faithconnect.local';
    const admin = await prisma_1.prisma.user.findFirst({ where: { email: adminEmail, tenantId: tenant.id } });
    const desiredPassword = 'Admin123!';
    const desiredHash = await bcryptjs_1.default.hash(desiredPassword, 10);
    if (!admin) {
        await prisma_1.prisma.user.create({ data: { name: 'Admin', email: adminEmail, passwordHash: desiredHash, role: 'ADMIN', tenantId: tenant.id } });
        console.log(`Admin user created: ${adminEmail} / ${desiredPassword}`);
    }
    else {
        // Ensure the known dev password to avoid login confusion
        await prisma_1.prisma.user.update({ where: { id: admin.id }, data: { passwordHash: desiredHash } });
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
        const exists = await prisma_1.prisma.department.findFirst({ where: { name: d.name, tenantId: tenant.id } });
        if (exists) {
            await prisma_1.prisma.department.update({ where: { id: exists.id }, data: { description: d.description, tenantId: tenant.id } });
        }
        else {
            await prisma_1.prisma.department.create({ data: { name: d.name, description: d.description, tenantId: tenant.id } });
        }
    }
    const memberCount = await prisma_1.prisma.member.count({ where: { tenantId: tenant.id } });
    if (memberCount === 0) {
        await prisma_1.prisma.member.create({ data: { firstName: 'John', lastName: 'Doe', gender: 'MALE', contact: '555-0001', address: '123 Main St', spiritualStatus: 'Baptized', tenantId: tenant.id } });
        await prisma_1.prisma.member.create({ data: { firstName: 'Mary', lastName: 'Smith', gender: 'FEMALE', contact: '555-0002', address: '42 Grace Rd', spiritualStatus: 'New Convert', tenantId: tenant.id } });
    }
    const upcomingEvent = await prisma_1.prisma.event.findFirst({ where: { title: 'Sunday Service', tenantId: tenant.id } });
    if (!upcomingEvent) {
        await prisma_1.prisma.event.create({ data: { title: 'Sunday Service', description: 'Weekly worship', date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), location: 'Main Sanctuary', tenantId: tenant.id } });
    }
    console.log('Seeding done.');
}
main().catch(e => {
    console.error(e);
}).finally(async () => {
    await prisma_1.prisma.$disconnect();
});
