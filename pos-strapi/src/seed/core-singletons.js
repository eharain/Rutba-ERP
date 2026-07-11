'use strict';

/**
 * Core singleton "ensure" seeders — the tiny, runtime-critical rows a fresh DB
 * needs before it is usable (UP roles + default_role, a published site-setting,
 * and the users-permissions email `from`).
 *
 * These used to run synchronously inside the server's bootstrap(). They now run
 * as ordinary registry entries via the standalone seed runner (scripts/seed.js)
 * / the seed control app, so the server no longer seeds on boot. Each is
 * idempotent — safe to run on every seed pass.
 */

// Ensures the site-setting singleType has a published row so consumers
// (especially rutba-web's storefront, which fetches this on every page render)
// don't 404 on a fresh DB. Schema defaults fill in everything; only site_name
// is required. Idempotent — bails if a published row already exists, promotes a
// draft if that's all we have, creates from scratch only when nothing exists.
async function ensureSiteSettingSingleton(strapi) {
    const uid = 'api::site-setting.site-setting';

    const published = await strapi.documents(uid).findFirst({ status: 'published' });
    if (published) return { skipped: true };

    const draft = await strapi.documents(uid).findFirst({ status: 'draft' });
    if (draft) {
        await strapi.documents(uid).publish({ documentId: draft.documentId });
        strapi.log.info('[seed] Published existing site-setting draft');
        return { updated: 1 };
    }

    await strapi.documents(uid).create({
        data: { site_name: 'Rutba.pk' },
        status: 'published',
    });
    strapi.log.info('[seed] Seeded default site-setting singleton');
    return { created: 1 };
}

// Strapi ships email templates seeded with no-reply@strapi.io — Mailcow rejects
// that as "sender not owned by user no-reply@rutba.pk" and forgot-password
// silently 500s. Every fresh DB import from the on-prem POS also brings the
// strapi.io value back, so patching once is not enough. Overwrite the `from` on
// both templates with the app's own EMAIL_FROM. Idempotent — a no-op when the
// templates already match.
async function ensureUsersPermissionsEmailFrom(strapi) {
    const fromEmail = process.env.EMAIL_FROM || 'no-reply@rutba.pk';
    const fromName = process.env.EMAIL_FROM_NAME || 'Rutba';

    const store = strapi.store({
        type: 'plugin',
        name: 'users-permissions',
        key: 'email',
    });
    const current = await store.get();
    if (!current || typeof current !== 'object') return { skipped: true };

    let changed = false;
    for (const key of ['reset_password', 'email_confirmation']) {
        const tpl = current[key];
        const opts = tpl && tpl.options;
        if (!opts) continue;
        const from = opts.from || {};
        if (from.email !== fromEmail || from.name !== fromName) {
            opts.from = { name: fromName, email: fromEmail };
            changed = true;
        }
    }
    if (changed) {
        await store.set({ value: current });
        strapi.log.info(`[seed] users-permissions email templates: from set to ${fromName} <${fromEmail}>`);
        return { updated: 1 };
    }
    return { skipped: true };
}

async function ensureUsersPermissionsDefaults(strapi) {
    const roleQuery = strapi.query('plugin::users-permissions.role');
    let created = 0;
    let updated = 0;

    let authenticatedRole = await roleQuery.findOne({ where: { type: 'authenticated' } });
    if (!authenticatedRole) {
        authenticatedRole = await roleQuery.create({
            data: {
                name: 'Authenticated',
                description: 'Default role given to authenticated user.',
                type: 'authenticated',
            },
        });
        created += 1;
        strapi.log.info('[seed] Created users-permissions role: authenticated');
    }

    const publicRole = await roleQuery.findOne({ where: { type: 'public' } });
    if (!publicRole) {
        await roleQuery.create({
            data: {
                name: 'Public',
                description: 'Default role given to unauthenticated user.',
                type: 'public',
            },
        });
        created += 1;
        strapi.log.info('[seed] Created users-permissions role: public');
    }

    const pluginStore = strapi.store({
        type: 'plugin',
        name: 'users-permissions',
        key: 'advanced',
    });

    const advanced = (await pluginStore.get()) || {};
    const nextDefaultRole = String(authenticatedRole.type || 'authenticated');

    if (advanced.default_role !== nextDefaultRole) {
        await pluginStore.set({ value: { ...advanced, default_role: nextDefaultRole } });
        updated += 1;
        strapi.log.info('[seed] Set users-permissions advanced.default_role to authenticated');
    }

    return { created, updated };
}

// Registration email verification. When enabled, Strapi's /auth/local/register
// sends a confirmation email and blocks /auth/local login until the user clicks
// the link. The link hits <PUBLIC_URL>/api/auth/email-confirmation, after which
// Strapi redirects the browser to `email_confirmation_redirection` (the
// storefront). Both settings live in the users-permissions `advanced` plugin
// store; a fresh POS DB import resets them, so we (re)apply on every seed run.
//
// Gated by EMAIL_CONFIRMATION (default on) so a dev box without working SMTP can
// switch it off — users then log in immediately, the pre-verification behaviour.
// We also grant the public role the `sendEmailConfirmation` auth action so the
// storefront can offer a "resend verification email" flow.
async function ensureUsersPermissionsEmailConfirmation(strapi) {
    const enabled =
        String(process.env.EMAIL_CONFIRMATION ?? 'true').toLowerCase() === 'true';
    const webUrl = (
        process.env.WEB_URL ||
        process.env.NEXT_PUBLIC_WEB_URL ||
        'https://rutba.pk'
    ).replace(/\/+$/, '');
    const redirection = `${webUrl}/login?confirmed=1`;
    let updated = 0;
    let created = 0;

    const pluginStore = strapi.store({
        type: 'plugin',
        name: 'users-permissions',
        key: 'advanced',
    });
    const advanced = (await pluginStore.get()) || {};

    const needsUpdate =
        advanced.email_confirmation !== enabled ||
        (enabled && advanced.email_confirmation_redirection !== redirection);

    if (needsUpdate) {
        await pluginStore.set({
            value: {
                ...advanced,
                email_confirmation: enabled,
                // Only meaningful when confirmation is on; harmless to keep otherwise.
                ...(enabled ? { email_confirmation_redirection: redirection } : {}),
            },
        });
        updated += 1;
        strapi.log.info(
            `[seed] users-permissions email_confirmation=${enabled}` +
            (enabled ? `, redirect=${redirection}` : '')
        );
    }

    // Public grant for the resend-confirmation route (POST /auth/send-email-confirmation).
    if (enabled) {
        const publicRole = await strapi
            .query('plugin::users-permissions.role')
            .findOne({ where: { type: 'public' }, select: ['id'] });
        if (publicRole) {
            const action = 'plugin::users-permissions.auth.sendEmailConfirmation';
            const existing = await strapi.db
                .query('plugin::users-permissions.permission')
                .findOne({ where: { action, role: { id: publicRole.id } }, select: ['id'] });
            if (!existing) {
                await strapi.db.query('plugin::users-permissions.permission').create({
                    data: { action, role: publicRole.id },
                });
                created += 1;
                strapi.log.info('[seed] granted public role auth.sendEmailConfirmation');
            }
        }
    }

    return { created, updated };
}

module.exports = {
    ensureSiteSettingSingleton,
    ensureUsersPermissionsEmailFrom,
    ensureUsersPermissionsEmailConfirmation,
    ensureUsersPermissionsDefaults,
};
