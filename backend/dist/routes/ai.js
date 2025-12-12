"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const openai_1 = __importDefault(require("openai"));
const prisma_1 = require("../config/prisma");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
router.post('/assist', (0, auth_1.requireRole)(['ADMIN', 'CLERK', 'PASTOR']), async (req, res) => {
    const { prompt, scope } = req.body;
    if (!prompt)
        return res.status(400).json({ message: 'Prompt required' });
    // Pull lightweight context from DB based on scope
    let context = '';
    try {
        if (scope === 'attendance') {
            const last10 = await prisma_1.prisma.attendanceRecord.findMany({ take: 10, orderBy: { date: 'desc' }, include: { entries: true } });
            const summary = last10.map((r) => `${r.date.toISOString().slice(0, 10)}: ${r.entries.filter((e) => e.present).length} present`).join('\n');
            context = `Recent attendance: \n${summary}`;
        }
        else if (scope === 'finance') {
            const now = new Date();
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0); // last day of previous month
            const [thisMonth, lastMonth] = await Promise.all([
                prisma_1.prisma.financeRecord.findMany({ where: { date: { gte: monthStart } } }),
                prisma_1.prisma.financeRecord.findMany({ where: { date: { gte: prevMonthStart, lte: prevMonthEnd } } }),
            ]);
            const sumBy = (arr, predicate) => arr.filter((r) => predicate(r.type)).reduce((a, b) => a + b.amount, 0);
            const tithesNow = sumBy(thisMonth, t => t === 'TITHE');
            const offeringsNow = sumBy(thisMonth, t => t === 'OFFERING');
            const donationsNow = sumBy(thisMonth, t => t === 'DONATION');
            const pledgesNow = sumBy(thisMonth, t => t === 'PLEDGE');
            const expensesNow = sumBy(thisMonth, t => t === 'EXPENSE');
            const tithesPrev = sumBy(lastMonth, t => t === 'TITHE');
            const offeringsPrev = sumBy(lastMonth, t => t === 'OFFERING');
            const donationsPrev = sumBy(lastMonth, t => t === 'DONATION');
            const pledgesPrev = sumBy(lastMonth, t => t === 'PLEDGE');
            const expensesPrev = sumBy(lastMonth, t => t === 'EXPENSE');
            const pct = (curr, prev) => (prev === 0 ? (curr > 0 ? 100 : 0) : ((curr - prev) / prev) * 100);
            const summary = {
                tithes: { curr: tithesNow, prev: tithesPrev, changePct: pct(tithesNow, tithesPrev) },
                offerings: { curr: offeringsNow, prev: offeringsPrev, changePct: pct(offeringsNow, offeringsPrev) },
                donations: { curr: donationsNow, prev: donationsPrev, changePct: pct(donationsNow, donationsPrev) },
                pledges: { curr: pledgesNow, prev: pledgesPrev, changePct: pct(pledgesNow, pledgesPrev) },
                expenses: { curr: expensesNow, prev: expensesPrev, changePct: pct(expensesNow, expensesPrev) },
            };
            context = `Finance this month vs last month: ${JSON.stringify(summary)}`;
        }
        else if (scope === 'members') {
            const members = await prisma_1.prisma.member.findMany({ select: { gender: true, dob: true, dateJoined: true } });
            const genderCounts = members.reduce((acc, m) => {
                const g = (m.gender || 'UNKNOWN').toUpperCase();
                acc[g] = (acc[g] || 0) + 1;
                return acc;
            }, {});
            const ages = members.filter((m) => !!m.dob).map((m) => {
                const dob = m.dob;
                const diff = Date.now() - dob.getTime();
                return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
            });
            const avgAge = ages.length ? (ages.reduce((a, b) => a + b, 0) / ages.length) : 0;
            const buckets = { children: 0, youth: 0, adults: 0, seniors: 0 };
            ages.forEach((a) => {
                if (a < 13)
                    buckets.children++;
                else if (a <= 30)
                    buckets.youth++;
                else if (a <= 60)
                    buckets.adults++;
                else
                    buckets.seniors++;
            });
            const now = new Date();
            const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            const prev60 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
            const joinedLast30 = members.filter((m) => m.dateJoined && m.dateJoined >= last30).length;
            const joinedPrev30 = members.filter((m) => m.dateJoined && m.dateJoined < last30 && m.dateJoined >= prev60).length;
            const growthRate = joinedPrev30 === 0 ? (joinedLast30 > 0 ? 1 : 0) : (joinedLast30 - joinedPrev30) / joinedPrev30;
            context = `Members: total=${members.length}; gender=${JSON.stringify(genderCounts)}; avgAge=${avgAge.toFixed(1)}; buckets=${JSON.stringify(buckets)}; growth30=${(growthRate * 100).toFixed(1)}%`;
        }
        else if (scope === 'events') {
            const upcoming = await prisma_1.prisma.event.findMany({ where: { date: { gte: new Date() } }, orderBy: { date: 'asc' }, take: 5 });
            context = `Upcoming events: ${upcoming.map((e) => `${e.title} on ${e.date.toISOString().slice(0, 10)}`).join(', ')}`;
        }
    }
    catch { }
    try {
        const systemPrompt = `You are the AI assistant for FaithConnect Church Management System. Be concise, include metrics, and suggest actionable next steps.`;
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `${prompt}\n\nContext:\n${context}` },
            ],
            temperature: 0.4,
        });
        const text = completion.choices[0]?.message?.content ?? 'No response';
        res.json({ text, context });
    }
    catch (err) {
        // Fallback: return computed context when AI key is missing
        if (!process.env.OPENAI_API_KEY) {
            return res.json({ text: `AI key missing. Here is a data summary: ${context}`, context });
        }
        res.status(500).json({ message: 'AI error', error: err.message });
    }
});
exports.default = router;
