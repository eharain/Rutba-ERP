'use strict';

/**
 * The letters an HR department actually issues, ready to use.
 *
 * Shared idempotent body used by BOTH:
 *   - database/migrations/2026.08.06T01.00.00.hr-letter-templates.js
 *   - the seed registry (on-demand re-run from the CLI / seed control app)
 *
 * Without these the Letters page is an empty dropdown, so they are the
 * difference between a working feature and a form that cannot be submitted.
 * They are deliberately plain and neutral — every organisation edits the wording,
 * and the seeder never overwrites an edited row.
 *
 * Substitution grammar matches notification-template: #{x}, {x} and {{x}} all
 * resolve. Variables always available (see hr-generated-document.generateDocument):
 *   employee_name, designation, department, company, cnic, email,
 *   date_of_joining, today, today_iso
 * Anything else listed in available_variables is prompted for on the generate
 * form and passed through — that is how salary, last_working_day and purpose
 * reach the letter.
 *
 * Idempotent: inserts only names that are absent, and repairs a NULL
 * document_id on rows a pre-fix run created (a raw knex insert does not
 * generate one, and Strapi 5 cannot link a relation whose target lacks it).
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<{created:number, skipped:number, repaired:number}>}
 */

const { generateDocumentId } = require('./hr-notification-templates');

const TEMPLATES = [
    {
        name: 'Offer Letter',
        type: 'Offer',
        subject: 'Offer of Employment',
        body_template: [
            'Dear {employee_name},',
            '',
            'Further to your interviews with us, we are pleased to offer you the position of {designation} in our {department} department at {company}.',
            '',
            'Your gross salary will be {salary} per month. Your start date will be {start_date}.',
            '',
            'This offer is subject to satisfactory reference and document checks. Please confirm your acceptance by signing and returning a copy of this letter by {response_by}.',
            '',
            'We look forward to welcoming you to the team.',
            '',
            'Sincerely,',
            'Human Resources',
            '{company}',
        ].join('\n'),
        available_variables: ['employee_name', 'designation', 'department', 'company', 'salary', 'start_date', 'response_by', 'today'],
    },
    {
        name: 'Appointment / Confirmation Letter',
        type: 'Confirmation',
        subject: 'Confirmation of Employment',
        body_template: [
            'Dear {employee_name},',
            '',
            'We are pleased to confirm your appointment as {designation} in the {department} department, with effect from {effective_date}.',
            '',
            'Your probationary period has been completed satisfactorily and you are now a confirmed employee of {company}. All terms of your original appointment continue to apply unless varied in writing.',
            '',
            'Congratulations, and thank you for your contribution so far.',
            '',
            'Sincerely,',
            'Human Resources',
            '{company}',
        ].join('\n'),
        available_variables: ['employee_name', 'designation', 'department', 'company', 'effective_date', 'today'],
    },
    {
        name: 'Experience Letter',
        type: 'Experience',
        subject: 'To Whom It May Concern',
        body_template: [
            'TO WHOM IT MAY CONCERN',
            '',
            'This is to certify that {employee_name} was employed with {company} as {designation} in the {department} department from {date_of_joining} to {last_working_day}.',
            '',
            'During this period we found {employee_name} to be sincere, hardworking and professional in the discharge of duties.',
            '',
            'We wish {employee_name} every success in future endeavours.',
            '',
            'Issued on {today} at the request of the employee.',
            '',
            'Human Resources',
            '{company}',
        ].join('\n'),
        available_variables: ['employee_name', 'designation', 'department', 'company', 'date_of_joining', 'last_working_day', 'today'],
    },
    {
        name: 'Salary Certificate',
        type: 'Salary',
        subject: 'Salary Certificate',
        body_template: [
            'TO WHOM IT MAY CONCERN',
            '',
            'This is to certify that {employee_name} (CNIC {cnic}) is employed with {company} as {designation} in the {department} department since {date_of_joining}.',
            '',
            'The current gross salary is {salary} per month.',
            '',
            'This certificate is issued on {today} at the request of the employee for the purpose of {purpose}. It does not constitute a guarantee of continued employment.',
            '',
            'Human Resources',
            '{company}',
        ].join('\n'),
        available_variables: ['employee_name', 'designation', 'department', 'company', 'cnic', 'date_of_joining', 'salary', 'purpose', 'today'],
    },
    {
        name: 'No Objection Certificate (NOC)',
        type: 'NOC',
        subject: 'No Objection Certificate',
        body_template: [
            'TO WHOM IT MAY CONCERN',
            '',
            'This is to certify that {employee_name} (CNIC {cnic}) is employed with {company} as {designation} since {date_of_joining}.',
            '',
            'The organisation has no objection to {employee_name} proceeding with {purpose}.',
            '',
            'This certificate is issued on {today} on request and carries no financial obligation on the part of the organisation.',
            '',
            'Human Resources',
            '{company}',
        ].join('\n'),
        available_variables: ['employee_name', 'designation', 'company', 'cnic', 'date_of_joining', 'purpose', 'today'],
    },
    {
        name: 'Warning Letter',
        type: 'Warning',
        subject: 'Letter of Warning',
        body_template: [
            'Dear {employee_name},',
            '',
            'This letter is a formal warning regarding {reason}.',
            '',
            'This conduct is not in keeping with the standards expected of a {designation} at {company}. You are required to correct it with immediate effect.',
            '',
            'Any repetition may lead to further disciplinary action, up to and including termination of employment. A copy of this letter will be placed on your personnel file.',
            '',
            'You may respond in writing to Human Resources within seven days if you wish to present your account of the matter.',
            '',
            'Issued on {today}.',
            '',
            'Human Resources',
            '{company}',
        ].join('\n'),
        available_variables: ['employee_name', 'designation', 'company', 'reason', 'today'],
    },
    {
        name: 'Relieving Letter',
        type: 'Experience',
        subject: 'Relieving Letter',
        body_template: [
            'Dear {employee_name},',
            '',
            'This is to confirm that your resignation from the position of {designation}, {department} department, has been accepted and that you were relieved of your duties at the close of business on {last_working_day}.',
            '',
            'We confirm that all company property in your possession has been returned and that your dues have been settled in full.',
            '',
            'We thank you for your service and wish you the very best.',
            '',
            'Issued on {today}.',
            '',
            'Human Resources',
            '{company}',
        ].join('\n'),
        available_variables: ['employee_name', 'designation', 'department', 'company', 'last_working_day', 'today'],
    },
];

async function applyHrLetterTemplates(knex) {
    const tableExists = await knex.schema.hasTable('hr_letter_templates');
    if (!tableExists) return { created: 0, skipped: 0, repaired: 0 };

    const names = TEMPLATES.map((t) => t.name);
    const existing = await knex('hr_letter_templates').whereIn('name', names).select('name');
    const have = new Set(existing.map((r) => r.name));

    const now = new Date();
    const toInsert = TEMPLATES.filter((t) => !have.has(t.name)).map((t) => ({
        document_id: generateDocumentId(),
        name: t.name,
        type: t.type,
        subject: t.subject,
        body_template: t.body_template,
        // JSON column on Postgres / longtext on MySQL — serialise so both
        // engines store it the same way.
        available_variables: JSON.stringify(t.available_variables),
        is_active: true,
        created_at: now,
        updated_at: now,
        published_at: now,
    }));

    if (toInsert.length > 0) {
        await knex('hr_letter_templates').insert(toInsert);
    }

    // Repair rows that are unusable as a relation target: a NULL document_id,
    // or one starting with a digit (Strapi coerces those to an integer, so the
    // link either truncates or points at nothing).
    const suspect = await knex('hr_letter_templates')
        .whereIn('name', names)
        .select('id', 'document_id');
    const orphaned = suspect.filter((r) => r.document_id == null || /^[0-9]/.test(String(r.document_id)));
    for (const row of orphaned) {
        await knex('hr_letter_templates').where({ id: row.id }).update({ document_id: generateDocumentId() });
    }

    return {
        created: toInsert.length,
        skipped: TEMPLATES.length - toInsert.length,
        repaired: orphaned.length,
    };
}

module.exports = { applyHrLetterTemplates, HR_LETTER_TEMPLATES: TEMPLATES };
