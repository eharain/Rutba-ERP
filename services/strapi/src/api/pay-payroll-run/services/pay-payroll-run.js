'use strict';

/**
 * Payroll Run engine.
 *
 * Computes payslips for a period across salaried, piece-rate (manufacturing),
 * hybrid and daily-wage workers in one unified run, applies unpaid leave +
 * adjustments, and posts to the accounting GL via the shared accounting engine.
 *
 * Accounting model (interim — see docs/todo/payroll-module-implementation.md §7.3):
 * all labour is expensed to PAYROLL_EXPENSE. This is correct while manufacturing
 * does not post labour_cost to the GL. The accrual entry is built from payslip
 * line categories so switching to the WIP-capitalisation model later is a change
 * to account selection here, not a rewrite.
 *
 * Every entry is keyed source_type 'Payroll Run' / 'Payroll Payment' + the run
 * or payslip id, so posting is idempotent (findBySource) and reversible
 * (reverseBySource). Accounting failures are logged, never thrown past the run.
 */

const { createCoreService } = require('@strapi/strapi').factories;
const { calendarForEmployee, countWorkingDays } = require('../../../utils/working-days');

const PR_UID = 'api::pay-payroll-run.pay-payroll-run';
const PS_UID = 'api::pay-payslip.pay-payslip';
const EMP_UID = 'api::hr-employee.hr-employee';
const PROFILE_UID = 'api::pay-employee-profile.pay-employee-profile';
const TASK_UID = 'api::mfg-task.mfg-task';
const LEAVE_UID = 'api::hr-leave-request.hr-leave-request';
const ADJ_UID = 'api::pay-adjustment.pay-adjustment';
const ATT_UID = 'api::hr-attendance.hr-attendance';
const OT_RULE_UID = 'api::hr-overtime-rule.hr-overtime-rule';

// Hours a full day is assumed to be when an overtime rule leaves the daily
// threshold blank — also the divisor that turns a daily/monthly rate into an
// hourly one.
const DEFAULT_STANDARD_HOURS = 8;

const PAYOUT_METHOD_KEY = {
    Cash: 'CASH_DRAWER',
    Bank: 'BANK_PRIMARY',
    'Mobile Wallet': 'MOBILE_WALLET',
};

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function daysInclusive(startStr, endStr) {
    const s = new Date(startStr);
    const e = new Date(endStr);
    const d = Math.floor((e - s) / 86400000) + 1;
    return d > 0 ? d : 1;
}

function overlapsPeriod(leave, startStr, endStr) {
    const ls = leave.start_date;
    const le = leave.end_date || leave.start_date;
    return ls <= endStr && le >= startStr;
}

module.exports = createCoreService(PR_UID, ({ strapi }) => ({

    /* ──────────────────────────────────────────────────────────────
     *  Public: process / preview / cancel / pay
     * ────────────────────────────────────────────────────────────── */

    async processRun(documentId, { user } = {}) {
        const run = await strapi.documents(PR_UID).findOne({
            documentId,
            populate: { branch: { fields: ['id'] } },
        });
        if (!run) { const e = new Error('Payroll run not found'); e.status = 404; throw e; }
        if (!['Draft', 'Approved'].includes(run.status)) {
            const e = new Error(`Run cannot be processed from status ${run.status}`); e.status = 409; throw e;
        }

        const accounting = strapi.service('api::acc-journal-entry.accounting');
        const existing = await accounting.findBySource('Payroll Run', run.id);
        if (existing && existing.length > 0) {
            const e = new Error('Run is already posted to the ledger'); e.status = 409; throw e;
        }

        const period = { start: run.period_start, end: run.period_end };
        const branchId = run.branch?.id || null;
        const employees = await this._selectEmployees(branchId);

        const created = [];
        let totalGross = 0, totalDeductions = 0, totalNet = 0;

        for (const emp of employees) {
            const calc = await this._gather(emp, period);
            if (!calc || (calc.gross === 0 && calc.deductions === 0)) continue;

            const payslip = await strapi.documents(PS_UID).create({
                data: {
                    period: `${period.start} → ${period.end}`,
                    gross: calc.gross,
                    deductions: calc.deductions,
                    net_pay: calc.net,
                    status: 'Pending',
                    employee: emp.id,
                    payroll_run: run.id,
                    ...(branchId ? { branch: branchId } : {}),
                    lines: calc.lines,
                },
            });

            // Lock the piece-rate tasks that fed this payslip.
            for (const tDocId of calc.taskDocIds) {
                try {
                    await strapi.documents(TASK_UID).update({
                        documentId: tDocId,
                        data: { payroll_locked: true, payslip: payslip.id },
                    });
                } catch (err) {
                    strapi.log.warn(`[payroll] failed to lock task ${tDocId}: ${err.message}`);
                }
            }

            // Apply adjustment recoveries / one-offs.
            for (const plan of calc.adjustmentPlans) {
                try {
                    await strapi.documents(ADJ_UID).update({
                        documentId: plan.documentId,
                        data: { balance: plan.newBalance, status: plan.newStatus, payslip: payslip.id },
                    });
                } catch (err) {
                    strapi.log.warn(`[payroll] failed to update adjustment ${plan.documentId}: ${err.message}`);
                }
            }

            created.push({ payslip, calc });
            totalGross += calc.gross;
            totalDeductions += calc.deductions;
            totalNet += calc.net;
        }

        const updated = await strapi.documents(PR_UID).update({
            documentId,
            data: {
                status: 'Processed',
                total_gross: round2(totalGross),
                total_deductions: round2(totalDeductions),
                total_net: round2(totalNet),
                processed_at: new Date(),
                processed_by: user?.email || user?.username || '',
            },
        });

        // Accounting accrual (best-effort).
        try {
            await this._postAccrual(run, created.map((c) => c.calc), {
                branchId,
                posted_by: user?.email || user?.username || '',
            });
        } catch (err) {
            strapi.log.error(`[payroll] accrual posting failed for run ${run.id}: ${err.message}`);
        }

        return { run: updated, payslip_count: created.length };
    },

    /** Compute without persisting — drives the run wizard preview. */
    async previewRun(documentId) {
        const run = await strapi.documents(PR_UID).findOne({
            documentId,
            populate: { branch: { fields: ['id'] } },
        });
        if (!run) { const e = new Error('Payroll run not found'); e.status = 404; throw e; }

        const period = { start: run.period_start, end: run.period_end };
        const employees = await this._selectEmployees(run.branch?.id || null);

        const rows = [];
        let totalGross = 0, totalDeductions = 0, totalNet = 0;
        for (const emp of employees) {
            const calc = await this._gather(emp, period);
            if (!calc || (calc.gross === 0 && calc.deductions === 0)) continue;
            rows.push({
                employee: { id: emp.id, documentId: emp.documentId, name: emp.name },
                gross: calc.gross, deductions: calc.deductions, net: calc.net, lines: calc.lines,
            });
            totalGross += calc.gross; totalDeductions += calc.deductions; totalNet += calc.net;
        }
        return {
            period,
            totals: { gross: round2(totalGross), deductions: round2(totalDeductions), net: round2(totalNet) },
            payslips: rows,
        };
    },

    async cancelRun(documentId, { user } = {}) {
        const run = await strapi.documents(PR_UID).findOne({
            documentId,
            populate: { payslips: { fields: ['status'] } },
        });
        if (!run) { const e = new Error('Payroll run not found'); e.status = 404; throw e; }
        if (run.status === 'Cancelled') return run;

        const anyPaid = (run.payslips || []).some((p) => p.status === 'Paid');
        if (anyPaid) {
            const e = new Error('Reverse payslip payments before cancelling the run'); e.status = 409; throw e;
        }

        // Reverse the accrual entry.
        try {
            const accounting = strapi.service('api::acc-journal-entry.accounting');
            await accounting.reverseBySource('Payroll Run', run.id, {
                posted_by: user?.email || user?.username || '',
            });
        } catch (err) {
            strapi.log.error(`[payroll] accrual reversal failed for run ${run.id}: ${err.message}`);
        }

        // Unlock tasks, restore adjustments, delete payslips.
        const payslips = await strapi.documents(PS_UID).findMany({
            filters: { payroll_run: { documentId } },
            populate: { tasks: { fields: ['documentId'] } },
            pagination: { pageSize: 1000 },
        });
        for (const ps of payslips) {
            for (const t of (ps.tasks || [])) {
                try {
                    await strapi.documents(TASK_UID).update({
                        documentId: t.documentId,
                        data: { payroll_locked: false, payslip: null },
                    });
                } catch (err) { strapi.log.warn(`[payroll] unlock task ${t.documentId}: ${err.message}`); }
            }
        }
        await this._restoreAdjustments(documentId);
        for (const ps of payslips) {
            try { await strapi.documents(PS_UID).delete({ documentId: ps.documentId }); }
            catch (err) { strapi.log.warn(`[payroll] delete payslip ${ps.documentId}: ${err.message}`); }
        }

        return strapi.documents(PR_UID).update({ documentId, data: { status: 'Cancelled' } });
    },

    async markPayslipPaid(payslipDocumentId, { method = 'Bank', bank_reference = '', date, user } = {}) {
        const payslip = await strapi.documents(PS_UID).findOne({
            documentId: payslipDocumentId,
            populate: { payroll_run: { fields: ['id', 'status'] }, branch: { fields: ['id'] } },
        });
        if (!payslip) { const e = new Error('Payslip not found'); e.status = 404; throw e; }
        if (payslip.status === 'Paid') return payslip;
        if (payslip.payroll_run?.status !== 'Processed') {
            const e = new Error('Parent run must be Processed before paying'); e.status = 409; throw e;
        }

        const updated = await strapi.documents(PS_UID).update({
            documentId: payslipDocumentId,
            data: {
                status: 'Paid',
                paid_at: date ? new Date(date) : new Date(),
                payment_method: method,
                bank_reference,
            },
        });

        // Payout JE (best-effort, idempotent — never double-post for one payslip).
        try {
            const accounting = strapi.service('api::acc-journal-entry.accounting');
            const already = await accounting.findBySource('Payroll Payment', payslip.id);
            if (!already || already.length === 0) {
                await this._postPayout(payslip, { method, branchId: payslip.branch?.id || null, posted_by: user?.email || user?.username || '' });
            }
        } catch (err) {
            strapi.log.error(`[payroll] payout posting failed for payslip ${payslip.id}: ${err.message}`);
        }

        // If every payslip in the run is now paid, flip the run to Paid.
        const siblings = await strapi.documents(PS_UID).findMany({
            filters: { payroll_run: { id: payslip.payroll_run.id } },
            fields: ['status'],
            pagination: { pageSize: 1000 },
        });
        if (siblings.length && siblings.every((p) => p.status === 'Paid')) {
            const run = await strapi.documents(PR_UID).findMany({
                filters: { id: payslip.payroll_run.id }, fields: ['documentId'], limit: 1,
            });
            if (run[0]) await strapi.documents(PR_UID).update({ documentId: run[0].documentId, data: { status: 'Paid' } });
        }

        return updated;
    },

    /* ──────────────────────────────────────────────────────────────
     *  Computation
     * ────────────────────────────────────────────────────────────── */

    async _selectEmployees(branchId) {
        const employees = await strapi.documents(EMP_UID).findMany({
            filters: { status: 'Active' },
            populate: {
                salary_structure: { populate: { salary_components: true } },
                // Scopes the employee's overtime rule (and is cheap here — the
                // alternative is one lookup per employee inside _gather).
                company: { fields: ['id'] },
            },
            pagination: { pageSize: 2000 },
        });
        if (!branchId) return employees;
        // Branch scoping is via the pay-employee-profile (hr-employee has no branch).
        const out = [];
        for (const emp of employees) {
            const prof = await this._profileFor(emp);
            if (!prof || !prof.branch || prof.branch.id === branchId) out.push(emp);
        }
        return out;
    },

    async _profileFor(emp) {
        const rows = await strapi.documents(PROFILE_UID).findMany({
            filters: { employee: { documentId: emp.documentId }, is_active: true },
            populate: {
                branch: { fields: ['id'] },
                overtime_rule: { fields: ['id', 'name', 'multiplier', 'applies_after_hours', 'is_active'] },
            },
            limit: 1,
        });
        return rows[0] || null;
    },

    /**
     * Build the payslip lines + totals for one employee. Read-only (no writes);
     * returns the adjustment-mutation plan for the caller to persist.
     */
    async _gather(emp, period) {
        const profile = await this._profileFor(emp);
        const payType = profile?.pay_type || (emp.salary_structure ? 'monthly_salary' : null);
        if (!payType) return null; // no comp setup → not on payroll

        const periodDays = daysInclusive(period.start, period.end);
        // One calendar per employee for the whole run. This is the same helper
        // the leave lifecycle stamps total_days with, so the days a balance was
        // charged and the days salary is docked cannot drift apart. Falls back
        // to calendar days if a period somehow contains no working day at all,
        // so the proration divisor is never zero.
        const calendar = await calendarForEmployee(strapi, emp.documentId, period.start, period.end);
        const workingDaysInPeriod = countWorkingDays(period.start, period.end, calendar) || periodDays;
        const lines = [];
        const taskDocIds = [];

        // --- Base earnings ---
        if (payType === 'monthly_salary' || payType === 'hybrid') {
            const base = Number(profile?.base_salary_override ?? emp.salary_structure?.base_salary ?? 0);
            if (base > 0) {
                // Proration for mid-period joiners.
                let earned = round2(base);
                if (emp.date_of_joining && emp.date_of_joining > period.start) {
                    const activeDays = daysInclusive(emp.date_of_joining, period.end);
                    earned = round2(base * Math.min(activeDays, periodDays) / periodDays);
                }
                lines.push({ label: 'Base salary', kind: 'earning', category: 'salary', amount: earned });
            }
            // Salary-structure components (allowances / recurring deductions).
            for (const c of (emp.salary_structure?.salary_components || [])) {
                const amt = c.calc === 'percent_of_base'
                    ? round2(Number(emp.salary_structure?.base_salary || 0) * Number(c.value || 0) / 100)
                    : round2(Number(c.value || 0));
                if (amt === 0) continue;
                lines.push({
                    label: c.name, kind: c.kind || 'earning',
                    category: c.kind === 'deduction' ? 'deduction' : 'allowance', amount: amt,
                });
            }
        }

        if (payType === 'piece_rate' || payType === 'hybrid') {
            const tasks = await strapi.documents(TASK_UID).findMany({
                filters: {
                    employee: { documentId: emp.documentId },
                    status: 'Approved',
                    payroll_locked: false,
                    approved_at: { $gte: `${period.start}T00:00:00.000Z`, $lte: `${period.end}T23:59:59.999Z` },
                },
                fields: ['documentId', 'amount', 'quantity_completed'],
                pagination: { pageSize: 5000 },
            });
            let pieceTotal = 0, qty = 0;
            for (const t of tasks) { pieceTotal += Number(t.amount || 0); qty += Number(t.quantity_completed || 0); taskDocIds.push(t.documentId); }
            if (pieceTotal > 0) {
                lines.push({ label: 'Piece-rate work', kind: 'earning', category: 'piece_rate', amount: round2(pieceTotal), quantity: qty });
            }
        }

        if (payType === 'daily_wage') {
            const rate = Number(profile?.daily_rate || 0);
            if (rate > 0) {
                const attendance = await strapi.documents('api::hr-attendance.hr-attendance').findMany({
                    filters: {
                        employee: { documentId: emp.documentId },
                        status: { $in: ['Present', 'Late'] },
                        date: { $gte: period.start, $lte: period.end },
                    },
                    fields: ['id'],
                    pagination: { pageSize: 1000 },
                });
                const days = attendance.length;
                if (days > 0) lines.push({ label: 'Daily wage', kind: 'earning', category: 'salary', amount: round2(rate * days), quantity: days, rate });
            }
        }

        // --- Overtime ---
        const overtimeLine = await this._computeOvertime({
            emp, profile, payType, period, workingDaysInPeriod,
        });
        if (overtimeLine) lines.push(overtimeLine);

        // --- Unpaid leave (salaried / hybrid only) ---
        if (payType === 'monthly_salary' || payType === 'hybrid') {
            const leaves = await strapi.documents(LEAVE_UID).findMany({
                filters: { employee: { documentId: emp.documentId }, status: 'Approved', leave_type: 'Unpaid' },
                fields: ['start_date', 'end_date', 'total_days'],
                pagination: { pageSize: 200 },
            });
            const base = Number(profile?.base_salary_override ?? emp.salary_structure?.base_salary ?? 0);
            let unpaidDays = 0;
            for (const lv of leaves) {
                const ls = lv.start_date, le = lv.end_date || lv.start_date;
                if (!ls || ls > period.end || le < period.start) continue; // no overlap with this period
                // Clip the leave to the run period so a leave spanning multiple
                // periods is only deducted for its in-period days (no double-count).
                const from = ls > period.start ? ls : period.start;
                const to = le < period.end ? le : period.end;
                // WORKING days, not calendar days: an unpaid week spanning a
                // public holiday docks the days actually owed, matching the
                // total_days the employee's leave balance was charged.
                unpaidDays += countWorkingDays(from, to, calendar);
            }
            if (unpaidDays > 0 && base > 0) {
                // Divided by working days for the same reason — a monthly salary
                // buys the period's working days, so one missed working day
                // costs base/workingDaysInPeriod, not base/calendarDays.
                const ded = round2(base / workingDaysInPeriod * Math.min(unpaidDays, workingDaysInPeriod));
                lines.push({ label: `Unpaid leave (${unpaidDays}d)`, kind: 'deduction', category: 'unpaid_leave', amount: ded, quantity: unpaidDays });
            }
        }

        // --- Adjustments (advances/loans/bonuses/penalties) ---
        const adjustmentPlans = [];
        const adjustments = await strapi.documents(ADJ_UID).findMany({
            filters: {
                employee: { documentId: emp.documentId },
                status: { $in: ['Pending', 'PartiallyApplied'] },
            },
            fields: ['documentId', 'type', 'amount', 'balance', 'recovery_per_period', 'effective_date'],
            pagination: { pageSize: 200 },
        });
        for (const adj of adjustments) {
            if (adj.effective_date && adj.effective_date > period.end) continue;
            if (adj.type === 'bonus' || adj.type === 'incentive') {
                lines.push({ label: adj.type === 'bonus' ? 'Bonus' : 'Incentive', kind: 'earning', category: adj.type, amount: round2(adj.amount), source_ref: adj.documentId });
                adjustmentPlans.push({ documentId: adj.documentId, newBalance: 0, newStatus: 'Applied' });
            } else if (adj.type === 'penalty' || adj.type === 'deduction') {
                lines.push({ label: adj.type === 'penalty' ? 'Penalty' : 'Deduction', kind: 'deduction', category: adj.type, amount: round2(adj.amount), source_ref: adj.documentId });
                adjustmentPlans.push({ documentId: adj.documentId, newBalance: 0, newStatus: 'Applied' });
            } else if (adj.type === 'advance' || adj.type === 'loan') {
                const balance = Number(adj.balance ?? adj.amount ?? 0);
                if (balance <= 0) continue;
                const recovery = round2(Math.min(Number(adj.recovery_per_period || balance), balance));
                if (recovery <= 0) continue;
                const newBalance = round2(balance - recovery);
                lines.push({ label: adj.type === 'loan' ? 'Loan recovery' : 'Advance recovery', kind: 'deduction', category: 'advance_recovery', amount: recovery, source_ref: adj.documentId });
                adjustmentPlans.push({ documentId: adj.documentId, newBalance, newStatus: newBalance <= 0 ? 'Applied' : 'PartiallyApplied' });
            }
        }

        // --- Configurable statutory deductions + employer contributions ---
        // Driven entirely by pay-deduction-rule records (no jurisdiction in code).
        // With zero active rules this is a no-op, preserving prior behaviour.
        const grossSoFar = round2(lines.filter((l) => l.kind === 'earning').reduce((s, l) => s + l.amount, 0));
        const baseSalary = Number(profile?.base_salary_override ?? emp.salary_structure?.base_salary ?? 0);
        const statutoryLines = await this._computeStatutory({
            payType,
            branchId: profile?.branch?.id || null,
            grossSoFar,
            baseSalary,
            period,
        });
        lines.push(...statutoryLines);

        // Employer-contribution lines (kind 'employer_contribution') are an
        // employer cost, NOT taken from the employee — so they are excluded from
        // gross / deductions / net here and only surface in the GL accrual.
        const gross = round2(lines.filter((l) => l.kind === 'earning').reduce((s, l) => s + l.amount, 0));
        const deductions = round2(lines.filter((l) => l.kind === 'deduction').reduce((s, l) => s + l.amount, 0));
        const net = round2(gross - deductions);

        return { lines, gross, deductions, net, taskDocIds, adjustmentPlans };
    },

    /* ──────────────────────────────────────────────────────────────
     *  Overtime
     * ────────────────────────────────────────────────────────────── */

    /**
     * The most specific active hr-overtime-rule for one employee, or null.
     *
     * Precedence: the employee's own `overtime_rule` override wins outright;
     * otherwise the most specific in-scope rule — branch beats company beats
     * org-wide — following the same "unscoped applies everywhere, scoped applies
     * only to its own scope" convention as pay-deduction-rule below. An empty
     * `applies_to_pay_types` means the rule covers every pay type, again as in
     * pay-deduction-rule, so a rule needs no configuration to start working.
     */
    async _overtimeRuleFor(profile, payType, branchId, companyId) {
        const override = profile?.overtime_rule;
        if (override?.is_active !== false && override?.id) return override;

        let rules;
        try {
            rules = await strapi.documents(OT_RULE_UID).findMany({
                filters: { is_active: { $eq: true } },
                populate: { branch: { fields: ['id'] }, company: { fields: ['id'] } },
                pagination: { pageSize: 200 },
            });
        } catch (err) {
            // Not migrated yet on a fresh boot — a missing rule table must not
            // fail the run; it just means no overtime.
            strapi.log.warn(`[payroll] overtime-rule load failed: ${err.message}`);
            return null;
        }

        const applicable = (rules || []).filter((r) => {
            const types = Array.isArray(r.applies_to_pay_types) ? r.applies_to_pay_types : [];
            if (types.length && !types.includes(payType)) return false;
            if (r.branch?.id && r.branch.id !== branchId) return false;
            if (r.company?.id && r.company.id !== companyId) return false;
            return true;
        });
        if (!applicable.length) return null;

        const specificity = (r) => (r.branch?.id ? 2 : 0) + (r.company?.id ? 1 : 0);
        return applicable.sort((a, b) => specificity(b) - specificity(a))[0];
    },

    /**
     * One overtime earning line, or null when none is owed.
     *
     * Hours come from hr-attendance.worked_hours, which the attendance
     * lifecycle derives from the clocked span less the rostered shift's break.
     * The threshold is per DAY (hr-overtime-rule.applies_after_hours), so each
     * day's excess is counted on its own — a 12-hour Monday earns overtime even
     * in a week that is otherwise short. Deliberately not a weekly threshold:
     * the rule stores one daily number and a run period is not a week.
     *
     * Overtime is only ever paid where an hourly rate can be derived from what
     * the employee is actually paid; piece-rate work has no such basis, so a
     * piece worker with no daily_rate earns none.
     */
    async _computeOvertime({ emp, profile, payType, period, workingDaysInPeriod }) {
        if (profile && profile.overtime_eligible === false) return null;

        const branchId = profile?.branch?.id || null;
        const companyId = emp?.company?.id || null;
        const rule = await this._overtimeRuleFor(profile, payType, branchId, companyId);
        if (!rule) return null;

        const threshold = Number(rule.applies_after_hours || 0) > 0
            ? Number(rule.applies_after_hours)
            : DEFAULT_STANDARD_HOURS;
        const multiplier = Number(rule.multiplier || 0) > 0 ? Number(rule.multiplier) : 1;

        let attendance;
        try {
            attendance = await strapi.documents(ATT_UID).findMany({
                filters: {
                    employee: { documentId: emp.documentId },
                    status: { $in: ['Present', 'Late'] },
                    date: { $gte: period.start, $lte: period.end },
                },
                fields: ['worked_hours'],
                pagination: { pageSize: 1000 },
            });
        } catch (err) {
            strapi.log.warn(`[payroll] overtime attendance load failed for ${emp.documentId}: ${err.message}`);
            return null;
        }

        let hours = 0;
        for (const a of attendance || []) {
            const worked = Number(a.worked_hours || 0);
            if (worked > threshold) hours += worked - threshold;
        }
        hours = Math.round(hours * 100) / 100;
        if (hours <= 0) return null;

        // Hourly rate from whatever this employee is actually paid.
        const daily = Number(profile?.daily_rate || 0);
        const base = Number(profile?.base_salary_override ?? emp.salary_structure?.base_salary ?? 0);
        let hourly = 0;
        if (payType === 'daily_wage' || payType === 'piece_rate') {
            hourly = daily > 0 ? daily / threshold : 0;
        } else {
            hourly = base > 0 ? (base / workingDaysInPeriod) / threshold : (daily > 0 ? daily / threshold : 0);
        }
        if (hourly <= 0) return null;

        const amount = round2(hours * hourly * multiplier);
        if (amount <= 0) return null;

        return {
            label: `Overtime (${hours}h @ ${multiplier}×)`,
            kind: 'earning',
            category: 'overtime',
            amount,
            quantity: hours,
            rate: round2(hourly * multiplier),
            source_ref: rule.documentId || String(rule.id),
        };
    },

    async _restoreAdjustments(runDocumentId) {
        const adjustments = await strapi.documents(ADJ_UID).findMany({
            filters: { payslip: { payroll_run: { documentId: runDocumentId } } },
            fields: ['documentId', 'type', 'amount'],
            pagination: { pageSize: 1000 },
        });
        for (const adj of adjustments) {
            try {
                await strapi.documents(ADJ_UID).update({
                    documentId: adj.documentId,
                    data: { status: 'Pending', payslip: null, ...(['advance', 'loan'].includes(adj.type) ? { balance: adj.amount } : {}) },
                });
            } catch (err) { strapi.log.warn(`[payroll] restore adjustment ${adj.documentId}: ${err.message}`); }
        }
    },

    /* ──────────────────────────────────────────────────────────────
     *  Configurable statutory deductions / employer contributions
     * ────────────────────────────────────────────────────────────── */

    /**
     * Apply the active pay-deduction-rule set to one employee. Pure read.
     * Returns payslip lines: employee rules → `deduction` (reduce net, credited
     * to the rule's GL liability key), employer rules → `employer_contribution`
     * (employer cost, excluded from net, credited to the same key). No
     * jurisdiction is hard-coded — behaviour is whatever rules exist.
     */
    async _computeStatutory({ payType, branchId, grossSoFar, baseSalary, period }) {
        let rules;
        try {
            rules = await strapi.documents('api::pay-deduction-rule.pay-deduction-rule').findMany({
                filters: { is_active: true },
                populate: { brackets: true, branch: { fields: ['id'] } },
                pagination: { pageSize: 500 },
            });
        } catch (err) {
            // Content type may not be migrated yet on first boot — degrade gracefully.
            strapi.log.warn(`[payroll] deduction-rule load failed: ${err.message}`);
            return [];
        }

        const applicable = (rules || [])
            .filter((r) => {
                const types = Array.isArray(r.applies_to_pay_types) ? r.applies_to_pay_types : [];
                if (types.length && !types.includes(payType)) return false;
                if (r.branch?.id && r.branch.id !== branchId) return false;
                if (r.effective_from && r.effective_from > period.end) return false;
                if (r.effective_to && r.effective_to < period.start) return false;
                return true;
            })
            .sort((a, b) => (a.sequence ?? 100) - (b.sequence ?? 100));

        const out = [];
        for (const r of applicable) {
            let base = r.base === 'base_salary' ? Number(baseSalary || 0) : Number(grossSoFar || 0);
            if (r.min_base != null) base = Math.max(base, Number(r.min_base));
            if (r.max_base != null) base = Math.min(base, Number(r.max_base));
            if (base < 0) base = 0;

            let amount = 0;
            if (r.method === 'flat') amount = Number(r.value || 0);
            else if (r.method === 'percent') amount = base * Number(r.value || 0) / 100;
            else if (r.method === 'slab') amount = this._slabAmount(base, r.brackets || []);

            if (r.min_amount != null) amount = Math.max(amount, Number(r.min_amount));
            if (r.max_amount != null) amount = Math.min(amount, Number(r.max_amount));
            amount = round2(amount);
            if (amount <= 0) continue;

            out.push({
                label: r.name,
                kind: r.payer === 'employer' ? 'employer_contribution' : 'deduction',
                category: r.payslip_category || 'deduction',
                amount,
                gl_account_key: r.gl_account_key || 'STATUTORY_PAYABLE',
                source_ref: r.code || r.documentId,
            });
        }
        return out;
    },

    /** Marginal progressive tax over sorted brackets; up_to ≤ 0 / unset = ∞ (top). */
    _slabAmount(base, brackets) {
        const sorted = [...(brackets || [])]
            .map((b) => ({ up_to: Number(b.up_to) > 0 ? Number(b.up_to) : Infinity, rate: Number(b.rate) || 0 }))
            .sort((a, b) => a.up_to - b.up_to);
        let prev = 0;
        let tax = 0;
        for (const b of sorted) {
            if (base <= prev) break;
            const slice = Math.min(base, b.up_to) - prev;
            if (slice > 0) tax += slice * b.rate / 100;
            prev = b.up_to;
            if (!isFinite(prev)) break;
        }
        return tax;
    },

    /* ──────────────────────────────────────────────────────────────
     *  Accounting bridge
     * ────────────────────────────────────────────────────────────── */

    async _postAccrual(run, calcs, { branchId, posted_by }) {
        const accounting = strapi.service('api::acc-journal-entry.accounting');
        const resolver = strapi.service('api::acc-journal-entry.account-resolver');

        // Aggregate across the whole run. Employee statutory deductions and
        // employer contributions both credit a liability — grouped by their
        // configured GL account key (default STATUTORY_PAYABLE). Employer
        // contributions also add to the expense debit (employer cost).
        let earnings = 0, advanceRec = 0, employerContrib = 0, contra = 0, net = 0;
        const payableByKey = {};
        const addPayable = (key, amt) => {
            const k = key || 'STATUTORY_PAYABLE';
            payableByKey[k] = round2((payableByKey[k] || 0) + amt);
        };
        for (const c of calcs) {
            net += c.net;
            for (const l of c.lines) {
                if (l.kind === 'earning') { earnings += l.amount; continue; }
                if (l.kind === 'employer_contribution') { employerContrib += l.amount; addPayable(l.gl_account_key, l.amount); continue; }
                // kind === 'deduction'
                if (l.category === 'advance_recovery') advanceRec += l.amount;
                else if (l.gl_account_key || ['tax', 'eobi', 'provident_fund'].includes(l.category)) addPayable(l.gl_account_key, l.amount);
                else contra += l.amount; // unpaid_leave / penalty / generic deduction → reduce expense
            }
        }
        const expense = round2(earnings - contra + employerContrib);
        net = round2(net); advanceRec = round2(advanceRec);
        if (expense <= 0) return; // nothing to post

        // Balances by construction: expense = earnings − contra + employerContrib,
        // and credits = net + advanceRec + Σpayable = the same. Push only non-zero
        // lines — createAndPost rejects a line with neither a debit nor a credit.
        const lines = [
            { account: await resolver.resolve('PAYROLL_EXPENSE', branchId), debit: expense, credit: 0, description: 'Payroll expense' },
        ];
        if (net > 0) lines.push({ account: await resolver.resolve('SALARY_PAYABLE', branchId), debit: 0, credit: net, description: 'Net pay payable' });
        if (advanceRec > 0) lines.push({ account: await resolver.resolve('EMPLOYEE_ADVANCES', branchId), debit: 0, credit: advanceRec, description: 'Advance / loan recovered' });
        for (const [key, amt] of Object.entries(payableByKey)) {
            if (amt > 0) lines.push({ account: await resolver.resolve(key, branchId), debit: 0, credit: amt, description: `Withholding / contribution (${key})` });
        }

        await accounting.createAndPost({
            date: new Date(),
            description: `Payroll ${run.period_start} → ${run.period_end}`,
            source_type: 'Payroll Run',
            source_id: run.id,
            source_ref: `RUN-${run.id}`,
            lines,
            branch: branchId,
            posted_by,
        });
    },

    async _postPayout(payslip, { method, branchId, posted_by }) {
        const accounting = strapi.service('api::acc-journal-entry.accounting');
        const resolver = strapi.service('api::acc-journal-entry.account-resolver');
        const net = round2(payslip.net_pay);
        if (net <= 0) return;

        const cashKey = PAYOUT_METHOD_KEY[method] || 'BANK_PRIMARY';
        await accounting.createAndPost({
            date: new Date(),
            description: `Payslip payout #${payslip.id}`,
            source_type: 'Payroll Payment',
            source_id: payslip.id,
            source_ref: `PS-${payslip.id}`,
            lines: [
                { account: await resolver.resolve('SALARY_PAYABLE', branchId), debit: net, credit: 0, description: 'Settle net pay' },
                { account: await resolver.resolve(cashKey, branchId), debit: 0, credit: net, description: `Paid via ${method}` },
            ],
            branch: branchId,
            posted_by,
        });
    },
}));
