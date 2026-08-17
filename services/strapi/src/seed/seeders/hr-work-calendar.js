'use strict';

/**
 * The reference data the HR work-calendar features need in order to do
 * anything: shifts, holidays, an overtime rule, and the appraisal competencies.
 *
 * Shared idempotent body used by BOTH:
 *   - database/migrations/2026.08.06T02.00.00.hr-work-calendar.js
 *   - the seed registry (on-demand re-run from the CLI / seed control app)
 *
 * These four content-types were configurable long before anything read them.
 * Now that leave maths excludes holidays, attendance derives Late from the
 * rostered shift, payroll pays overtime and appraisals score competencies, an
 * EMPTY table is the new version of the old problem — the feature is wired but
 * silently inert until someone populates it. So the defaults ship.
 *
 * Everything here is deliberately generic and editable in-app; the seeder never
 * overwrites an edited row, and matches on `name` (the natural key each of these
 * tables is managed by) so a re-run is a no-op.
 *
 * Only fixed-date public holidays are seeded, as recurring rows. Eid, Ashura and
 * Eid Milad-un-Nabi follow the lunar calendar and move every year — HR adds
 * those per year, which is why is_recurring_yearly exists per row rather than
 * being assumed.
 *
 * @param {import('knex').Knex} knex
 */

const { generateDocumentId } = require('./hr-notification-templates');

const SHIFTS = [
    { name: 'General (9–6)', start_time: '09:00:00.000', end_time: '18:00:00.000', break_minutes: 60, grace_minutes: 15 },
    { name: 'Morning (8–4)', start_time: '08:00:00.000', end_time: '16:00:00.000', break_minutes: 45, grace_minutes: 15 },
    { name: 'Evening (2–10)', start_time: '14:00:00.000', end_time: '22:00:00.000', break_minutes: 45, grace_minutes: 15 },
    { name: 'Night (10–6)', start_time: '22:00:00.000', end_time: '06:00:00.000', break_minutes: 60, grace_minutes: 15 },
];

// Seeded on 2026 dates; the recurring flag is what makes them apply every year,
// so the stored year is only ever a starting point.
const HOLIDAYS = [
    { name: 'Kashmir Solidarity Day', date: '2026-02-05' },
    { name: 'Pakistan Day', date: '2026-03-23' },
    { name: 'Labour Day', date: '2026-05-01' },
    { name: 'Independence Day', date: '2026-08-14' },
    { name: 'Iqbal Day', date: '2026-11-09' },
    { name: 'Quaid-e-Azam Day', date: '2026-12-25' },
];

const OVERTIME_RULES = [
    {
        name: 'Standard overtime (1.5×)',
        multiplier: 1.5,
        applies_after_hours: 8,
        // Empty = every pay type, same convention as pay-deduction-rule. In
        // practice this only reaches employees who actually accrue worked_hours
        // from attendance, and pay-employee-profile.overtime_eligible is the
        // per-employee opt-out.
        applies_to_pay_types: [],
    },
];

const COMPETENCIES = [
    { name: 'Job Knowledge', category: 'Technical', description: 'Depth of skill and understanding required by the role.' },
    { name: 'Quality of Work', category: 'Technical', description: 'Accuracy, thoroughness and consistency of output.' },
    { name: 'Productivity', category: 'Technical', description: 'Volume of useful work completed against what the role expects.' },
    { name: 'Problem Solving', category: 'Technical', description: 'Diagnoses issues and finds workable solutions independently.' },
    { name: 'Communication', category: 'Behavioral', description: 'Clear, timely and appropriate with colleagues and customers.' },
    { name: 'Teamwork', category: 'Behavioral', description: 'Works with others and supports shared goals over individual credit.' },
    { name: 'Reliability', category: 'Behavioral', description: 'Attendance, punctuality and following through on commitments.' },
    { name: 'Adaptability', category: 'Behavioral', description: 'Handles change, new tools and shifting priorities.' },
    { name: 'Initiative', category: 'Leadership', description: 'Acts without being asked and improves how the work is done.' },
    { name: 'People Development', category: 'Leadership', description: 'Coaches, delegates and grows the people around them.' },
    { name: 'Decision Making', category: 'Leadership', description: 'Makes sound, timely calls and owns the outcome.' },
];

/**
 * Insert whichever of `rows` are absent, matched on `name`, and repair any
 * document_id that cannot serve as a relation target (NULL, or leading digit —
 * Strapi coerces those to an integer, so the link truncates or resolves to
 * nothing). Returns a per-table summary.
 */
async function ensureRows(knex, table, rows, buildValues) {
    if (!(await knex.schema.hasTable(table))) return { created: 0, skipped: 0, repaired: 0 };

    const names = rows.map((r) => r.name);
    const existing = await knex(table).whereIn('name', names).select('name');
    const have = new Set(existing.map((r) => r.name));

    const now = new Date();
    const toInsert = rows.filter((r) => !have.has(r.name)).map((r) => ({
        document_id: generateDocumentId(),
        name: r.name,
        ...buildValues(r),
        created_at: now,
        updated_at: now,
        published_at: now,
    }));
    if (toInsert.length > 0) await knex(table).insert(toInsert);

    const suspect = await knex(table).whereIn('name', names).select('id', 'document_id');
    const orphaned = suspect.filter((r) => r.document_id == null || /^[0-9]/.test(String(r.document_id)));
    for (const row of orphaned) {
        await knex(table).where({ id: row.id }).update({ document_id: generateDocumentId() });
    }

    return { created: toInsert.length, skipped: rows.length - toInsert.length, repaired: orphaned.length };
}

async function applyHrWorkCalendar(knex) {
    const shifts = await ensureRows(knex, 'hr_shifts', SHIFTS, (s) => ({
        start_time: s.start_time,
        end_time: s.end_time,
        break_minutes: s.break_minutes,
        grace_minutes: s.grace_minutes,
        is_active: true,
    }));

    const holidays = await ensureRows(knex, 'hr_holiday_calendars', HOLIDAYS, (h) => ({
        date: h.date,
        is_recurring_yearly: true,
        description: 'Fixed-date public holiday.',
    }));

    const overtime = await ensureRows(knex, 'hr_overtime_rules', OVERTIME_RULES, (r) => ({
        multiplier: r.multiplier,
        applies_after_hours: r.applies_after_hours,
        // JSON column on Postgres / longtext on MySQL — serialise so both
        // engines store it the same way.
        applies_to_pay_types: JSON.stringify(r.applies_to_pay_types),
        is_active: true,
    }));

    const competencies = await ensureRows(knex, 'hr_competencies', COMPETENCIES, (c) => ({
        category: c.category,
        description: c.description,
        is_active: true,
    }));

    const sum = (k) => shifts[k] + holidays[k] + overtime[k] + competencies[k];
    return {
        created: sum('created'),
        skipped: sum('skipped'),
        repaired: sum('repaired'),
        detail: { shifts, holidays, overtime, competencies },
    };
}

module.exports = {
    applyHrWorkCalendar,
    HR_SHIFTS: SHIFTS,
    HR_HOLIDAYS: HOLIDAYS,
    HR_OVERTIME_RULES: OVERTIME_RULES,
    HR_COMPETENCIES: COMPETENCIES,
};
