// =============================================
// NexoBot MVP — Email Notification Service
// =============================================
// Sends weekly summaries, debt alerts, and welcome emails
// using Resend (https://resend.com). Free tier: 100 emails/day.

import { Resend } from 'resend';
import supabase from '../config/supabase.js';
import * as Transaction from '../models/transaction.js';
import * as Customer from '../models/customer.js';

const resend = process.env.RESEND_API_KEY
    ? new Resend(process.env.RESEND_API_KEY)
    : null;

const FROM_EMAIL = process.env.EMAIL_FROM || 'NexoBot <noreply@nexofinanzas.com>';

// =============================================
// WEEKLY SUMMARY EMAIL
// =============================================

/**
 * Send weekly summary email to a merchant
 */
export async function sendWeeklySummary(merchant) {
    if (!resend || !merchant.email) return { success: false, error: 'Email not configured' };

    try {
        const weekly = await Transaction.getWeeklySummary(merchant.id);
        const debtors = await Customer.getDebtors(merchant.id);
        const totalDebt = debtors.reduce((sum, d) => sum + d.total_debt, 0);

        const html = buildWeeklySummaryHTML({
            name: merchant.name || 'Comerciante',
            totalSales: weekly.total || 0,
            totalCollected: weekly.collected || 0,
            txCount: weekly.count || 0,
            avgTicket: weekly.avgTicket || 0,
            totalDebt,
            debtorsCount: debtors.length,
            topDebtors: debtors.slice(0, 5),
            weekStart: getWeekStart(),
            weekEnd: getWeekEnd()
        });

        const { data, error } = await resend.emails.send({
            from: FROM_EMAIL,
            to: merchant.email,
            subject: `📊 NexoBot — Tu resumen semanal (${formatDateShort(getWeekStart())} - ${formatDateShort(getWeekEnd())})`,
            html
        });

        if (error) throw error;

        console.log(`📧 Weekly summary sent to ${merchant.email} (${merchant.name})`);
        return { success: true, id: data?.id };
    } catch (err) {
        console.error(`❌ Email error for ${merchant.email}:`, err);
        return { success: false, error: err.message };
    }
}

// =============================================
// DEBT ALERT EMAIL
// =============================================

/**
 * Send debt alert when a customer's debt exceeds threshold
 */
export async function sendDebtAlert(merchant, customer, totalDebt) {
    if (!resend || !merchant.email) return { success: false };

    try {
        const html = buildDebtAlertHTML({
            merchantName: merchant.name || 'Comerciante',
            customerName: customer.name,
            totalDebt,
            riskLevel: customer.risk_level || 'medium'
        });

        await resend.emails.send({
            from: FROM_EMAIL,
            to: merchant.email,
            subject: `⚠️ Alerta de deuda — ${customer.name} (${formatPYG(totalDebt)})`,
            html
        });

        console.log(`📧 Debt alert sent for ${customer.name} to ${merchant.email}`);
        return { success: true };
    } catch (err) {
        console.error(`❌ Debt alert email error:`, err);
        return { success: false, error: err.message };
    }
}

// =============================================
// WELCOME EMAIL
// =============================================

export async function sendWelcomeEmail(merchant) {
    if (!resend || !merchant.email) return { success: false };

    try {
        const html = buildWelcomeHTML({ name: merchant.name || 'Comerciante' });

        await resend.emails.send({
            from: FROM_EMAIL,
            to: merchant.email,
            subject: `🤖 ¡Bienvenido a NexoBot! Tu asistente comercial`,
            html
        });

        console.log(`📧 Welcome email sent to ${merchant.email}`);
        return { success: true };
    } catch (err) {
        console.error(`❌ Welcome email error:`, err);
        return { success: false, error: err.message };
    }
}

// =============================================
// WEEKLY SUMMARY CRON
// =============================================

/**
 * Send weekly summaries to ALL merchants with email
 * Should run every Monday at 8 AM Paraguay time
 */
export async function runWeeklySummaryCron() {
    if (!resend || !supabase) {
        console.log('📧 Email cron skipped — not configured');
        return;
    }

    try {
        const { data: merchants } = await supabase
            .from('merchants')
            .select('*')
            .not('email', 'is', null);

        if (!merchants?.length) {
            console.log('📧 No merchants with email found');
            return;
        }

        let sent = 0, failed = 0;
        for (const merchant of merchants) {
            const result = await sendWeeklySummary(merchant);
            if (result.success) sent++;
            else failed++;

            // Rate limiting: 2 emails per second
            await new Promise(r => setTimeout(r, 500));
        }

        console.log(`📧 Weekly summaries: ${sent} sent, ${failed} failed (${merchants.length} total)`);
    } catch (err) {
        console.error('❌ Weekly summary cron error:', err);
    }
}

/**
 * Start the weekly email cron (Mondays 8 AM PYT)
 */
export function startEmailCron() {
    if (!resend) {
        console.log('📧 Email cron disabled — RESEND_API_KEY not set');
        return;
    }

    // Calculate ms until next Monday 8 AM PYT (UTC-3)
    const now = new Date();
    const nextMonday = new Date(now);
    nextMonday.setUTCHours(11, 0, 0, 0); // 8 AM PYT = 11 UTC
    const dayOfWeek = now.getUTCDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? (now.getUTCHours() >= 11 ? 7 : 0) : 8 - dayOfWeek;
    nextMonday.setUTCDate(now.getUTCDate() + daysUntilMonday);

    const msUntilNext = nextMonday.getTime() - now.getTime();
    const hoursUntil = Math.round(msUntilNext / 3600000);

    // First run at next Monday 8 AM, then every 7 days
    setTimeout(() => {
        runWeeklySummaryCron();
        setInterval(runWeeklySummaryCron, 7 * 24 * 60 * 60 * 1000);
    }, msUntilNext);

    console.log(`📧 Email cron: next run in ${hoursUntil} hours (Monday 8 AM PYT)`);
}

// =============================================
// HTML EMAIL TEMPLATES
// =============================================

function buildWeeklySummaryHTML({ name, totalSales, totalCollected, txCount, avgTicket, totalDebt, debtorsCount, topDebtors, weekStart, weekEnd }) {
    return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="margin:0;padding:0;font-family:'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
        <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
            
            <!-- Header -->
            <div style="background:linear-gradient(135deg,#6366f1,#4f46e5);padding:32px;text-align:center;">
                <div style="font-size:32px;margin-bottom:8px;">🤖</div>
                <h1 style="color:white;margin:0;font-size:22px;">Resumen Semanal</h1>
                <p style="color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:14px;">
                    ${formatDateShort(weekStart)} — ${formatDateShort(weekEnd)}
                </p>
            </div>

            <!-- Greeting -->
            <div style="padding:24px 32px 0;">
                <p style="color:#333;font-size:16px;">¡Hola <strong>${name}</strong>! 👋</p>
                <p style="color:#666;font-size:14px;">Acá tenés el resumen de tu semana:</p>
            </div>

            <!-- Stats Grid -->
            <div style="padding:16px 32px;display:flex;flex-wrap:wrap;gap:12px;">
                ${statBox('💰', 'Ventas', formatPYG(totalSales), '#6366f1')}
                ${statBox('✅', 'Cobrado', formatPYG(totalCollected), '#10b981')}
                ${statBox('📋', 'Deuda total', formatPYG(totalDebt), '#ef4444')}
                ${statBox('🧾', 'Operaciones', txCount.toString(), '#3b82f6')}
            </div>

            <!-- Collection Rate -->
            <div style="padding:0 32px 16px;">
                <div style="background:#f8f9fa;border-radius:12px;padding:16px;text-align:center;">
                    <span style="font-size:14px;color:#666;">Tasa de cobro: </span>
                    <strong style="font-size:18px;color:${totalSales > 0 ? (totalCollected / totalSales > 0.7 ? '#10b981' : '#f59e0b') : '#94a3b8'};">
                        ${totalSales > 0 ? Math.round(totalCollected / totalSales * 100) : 0}%
                    </strong>
                </div>
            </div>

            <!-- Top Debtors -->
            ${topDebtors.length > 0 ? `
            <div style="padding:0 32px 24px;">
                <h3 style="color:#333;font-size:15px;margin-bottom:12px;">🔴 Principales deudores</h3>
                ${topDebtors.map(d => `
                    <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f0f0;">
                        <span style="color:#333;font-size:14px;">${d.name}</span>
                        <strong style="color:#ef4444;font-size:14px;">${formatPYG(d.total_debt)}</strong>
                    </div>
                `).join('')}
            </div>` : ''}

            <!-- Footer -->
            <div style="background:#f8f9fa;padding:24px 32px;text-align:center;border-top:1px solid #eee;">
                <p style="color:#999;font-size:12px;margin:0;">
                    Enviado por NexoBot 🤖 | 
                    <a href="https://nexobot-mvp-1.onrender.com" style="color:#6366f1;">Ver dashboard</a>
                </p>
                <p style="color:#bbb;font-size:11px;margin:8px 0 0;">
                    NexoFinanzas — Gestión financiera para LATAM 🇵🇾
                </p>
            </div>
        </div>
    </body>
    </html>`;
}

function buildDebtAlertHTML({ merchantName, customerName, totalDebt, riskLevel }) {
    const riskColor = riskLevel === 'high' ? '#ef4444' : riskLevel === 'medium' ? '#f59e0b' : '#10b981';
    const riskLabel = riskLevel === 'high' ? '🔴 Alto' : riskLevel === 'medium' ? '🟡 Medio' : '🟢 Bajo';

    return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="margin:0;padding:0;font-family:'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
        <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">
            <div style="background:linear-gradient(135deg,#ef4444,#dc2626);padding:32px;text-align:center;">
                <div style="font-size:32px;">⚠️</div>
                <h1 style="color:white;margin:8px 0 0;font-size:20px;">Alerta de Deuda</h1>
            </div>
            <div style="padding:32px;">
                <p style="color:#333;">Hola <strong>${merchantName}</strong>,</p>
                <p style="color:#666;">La deuda de <strong>${customerName}</strong> requiere atención:</p>
                <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:20px;text-align:center;margin:20px 0;">
                    <div style="font-size:28px;font-weight:800;color:#ef4444;">${formatPYG(totalDebt)}</div>
                    <div style="color:#666;font-size:13px;margin-top:4px;">Riesgo: <span style="color:${riskColor};font-weight:600;">${riskLabel}</span></div>
                </div>
                <p style="color:#666;font-size:14px;">💡 Tip: Enviá <em>"recordale a ${customerName}"</em> al bot para mandar un recordatorio automático.</p>
            </div>
        </div>
    </body>
    </html>`;
}

function buildWelcomeHTML({ name }) {
    return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="margin:0;padding:0;font-family:'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
        <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">
            <div style="background:linear-gradient(135deg,#6366f1,#4f46e5);padding:40px;text-align:center;">
                <div style="font-size:48px;margin-bottom:12px;">🤖</div>
                <h1 style="color:white;margin:0;font-size:24px;">¡Bienvenido a NexoBot!</h1>
                <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;">Tu asistente comercial inteligente</p>
            </div>
            <div style="padding:32px;">
                <p style="color:#333;font-size:16px;">¡Hola <strong>${name}</strong>! 🎉</p>
                <p style="color:#666;">Ya podés usar NexoBot por WhatsApp. Probá estos comandos:</p>
                <div style="background:#f8f9fa;border-radius:12px;padding:20px;margin:16px 0;">
                    <p style="margin:8px 0;color:#333;font-size:14px;">📝 <em>"Vendí 500 mil a Carlos, fiado"</em></p>
                    <p style="margin:8px 0;color:#333;font-size:14px;">💰 <em>"Cobré 200 mil de María"</em></p>
                    <p style="margin:8px 0;color:#333;font-size:14px;">📋 <em>"¿Cuánto me deben?"</em></p>
                    <p style="margin:8px 0;color:#333;font-size:14px;">📊 <em>"¿Cómo me fue esta semana?"</em></p>
                    <p style="margin:8px 0;color:#333;font-size:14px;">🔐 <em>"pin 1234"</em> — para acceder al dashboard</p>
                </div>
                <p style="color:#666;font-size:14px;">📊 Accedé a tu dashboard en: <a href="https://nexobot-mvp-1.onrender.com" style="color:#6366f1;">nexobot-mvp-1.onrender.com</a></p>
            </div>
        </div>
    </body>
    </html>`;
}

// =============================================
// HELPERS
// =============================================

function statBox(emoji, label, value, color) {
    return `<div style="flex:1;min-width:120px;background:${color}10;border:1px solid ${color}30;border-radius:12px;padding:16px;text-align:center;">
        <div style="font-size:20px;">${emoji}</div>
        <div style="font-size:18px;font-weight:700;color:${color};margin:4px 0;">${value}</div>
        <div style="font-size:12px;color:#666;">${label}</div>
    </div>`;
}

function formatPYG(amount) {
    if (!amount) return 'Gs. 0';
    if (amount >= 1000000) return `Gs. ${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `Gs. ${Math.round(amount / 1000)}K`;
    return `Gs. ${amount.toLocaleString('es-PY')}`;
}

function formatDateShort(date) {
    return date.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' });
}

function getWeekStart() {
    const d = new Date();
    d.setUTCHours(-3); // PYT
    d.setDate(d.getDate() - d.getDay() + 1); // Monday
    d.setHours(0, 0, 0, 0);
    return d;
}

function getWeekEnd() {
    const d = getWeekStart();
    d.setDate(d.getDate() + 6);
    return d;
}

export default { sendWeeklySummary, sendDebtAlert, sendWelcomeEmail, startEmailCron };
