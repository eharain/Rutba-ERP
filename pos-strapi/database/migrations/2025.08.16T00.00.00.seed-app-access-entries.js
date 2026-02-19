'use strict';

/**
 * Seed the standard App Access entries.
 *
 * Strapi 5 runs migration files from database/migrations/ in
 * alphabetical order via umzug.  The `up` function receives a
 * Knex instance (wrapped in a transaction).
 */

const ENTRIES = [
    { key: 'stock', name: 'Stock Management', description: 'Products, purchases, inventory, suppliers, brands & categories' },
    { key: 'sale', name: 'Point of Sale', description: 'Sales, cart, returns, cash register & reports' },
    { key: 'accounts', name: 'Accounting', description: 'Manage accounts and reports' },
    { key: 'delivery', name: 'Delivery', description: 'Delivery Managment' },
    { key: 'crm', name: 'Custmer Releation Management', description: 'Custmer Releation Management' },
    { key: 'auth', name: 'User Management', description: 'Manage users, roles and app access assignments' },
    { key: 'web-user', name: 'My Orders', description: 'Track web orders, manage orders and request returns' },
    { key: 'hr', name: 'Human Resources', description: 'Employees, departments, attendance and leave management' },
    { key: 'payroll', name: 'Payroll', description: 'Salary structures, payroll runs and payslips' },

];

async function up(knex) {
    for (const entry of ENTRIES) {
        // Check if the entry already exists (idempotent)
        const existing = await knex('app_accesses')
            .where('key', entry.key)
            .first();

        if (!existing) {
            await knex('app_accesses').insert({
                document_id: hashCode([entry.description, entry.key, entry.name].join('-')),
                key: entry.key,
                name: entry.name,
                description: entry.description,
                created_at: new Date(),
                updated_at: new Date(),
                published_at: new Date(),
            });
        }
    }
}

async function down(knex) {
    for (const entry of ENTRIES) {
        await knex('app_accesses')
            .where('key', entry.key)
            .del();
    }
}

function hashCode(s) {
    return s.split("").reduce(function (a, b) {
        a = ((a << 5) - a) + b.charCodeAt(0);
        return a & a;
    }, 0);
}


module.exports = { up, down };
