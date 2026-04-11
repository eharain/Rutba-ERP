'use strict';

/**
 * app-access-guard
 *
 * Global Strapi middleware that enforces access control for
 * users with the `rutba_app_user` role.
 *
 * Headers:
 *   X-Rutba-App        Ã¢â‚¬â€ identifies the originating app (required)
 *   X-Rutba-App-Admin  Ã¢â‚¬â€ set to the app key to request elevation
 *                         (owner-scoping bypass).  Only honoured
 *                         when the user's admin_app_accesses
 *                         includes that key.
 *
 * Rules:
 *
 *  b.1  If the user's role is NOT `rutba_app_user`, the middleware
 *       does nothing Ã¢â‚¬â€ Strapi's own role/permission system decides.
 *
 *  b.2  If the user IS `rutba_app_user` but no `X-Rutba-App` header
 *       is present, the request is rejected (403).
 *
 *  b.3  When `X-Rutba-App` is present the middleware resolves the
 *       user's `app_accesses` and `admin_app_accesses`:
 *
 *       b.3.a  If `X-Rutba-App-Admin` header matches a key in the
 *              user's admin_app_accesses, the request is processed
 *              without owner scoping (elevated / admin mode) Ã¢â‚¬â€ but
 *              only if the app-access permissions are listed.
 *
 *       b.3.b  For every other request owner scoping is applied so
 *              the user can only see / modify entries they own Ã¢â‚¬â€
 *              only if the app-access permissions are listed.
 */

const { permissionsByKey } = require('../../config/app-access-permissions');

// ───────────────────── helpers ──────────────────────────────
function normaliseAction(action) {
  if (!action) return null;
  if (action === 'findOne' || action === 'search') return 'find';
  if (action === 'destroy') return 'delete';
  return action;
}

function hasPermissionViaKeys(keys, uid, action) {
  for (const key of keys) {
    const defs = permissionsByKey[key];
    if (!defs) continue;
    for (const def of defs) {
      if (def.uid === uid && def.actions.includes(action)) {
        return true;
      }
    }
  }
  return false;
}

// ───────────────────── middleware ────────────────────────────
module.exports = (config, { strapi }) => {

  const accessCache = new Map();

  async function getUserAccess(userId) {
    if (accessCache.has(userId)) return accessCache.get(userId);

    const user = await strapi.query('plugin::users-permissions.user').findOne({
      where: { id: userId },
      populate: {
        role: { select: ['type'] },
        app_accesses: { select: ['key'] },
        admin_app_accesses: { select: ['key'] },
      },
    });

    const result = {
      roleType: user?.role?.type || null,
      appKeys: (user?.app_accesses || []).map((a) => a.key),
      adminKeys: (user?.admin_app_accesses || []).map((a) => a.key),
    };
    accessCache.set(userId, result);
    setTimeout(() => accessCache.delete(userId), 60_000);
    return result;
  }

  return async (ctx, next) => {

    const user = ctx.state?.user;
    if (!user) return next();

    const route = ctx.state?.route;
    if (!route) return next();

    const handler = route.handler || '';
    const parts = handler.split('.');
    if (parts.length < 3) return next();

    const uid = `${parts[0]}.${parts[1]}`;

    // Only guard api:: content-type routes Ã¢â‚¬â€ skip plugin routes
    // (e.g. plugin::users-permissions.me.mePermissions)
    if (!uid.startsWith('api::')) return next();
    const rawAction = parts[2];
    const action = normaliseAction(rawAction);

      // ── b.1  Non-rutba_app_user → let Strapi decide ──────────
    const { roleType, appKeys, adminKeys } = await getUserAccess(user.id);

    // ── b.1b  rutba_web_user → enforce owner scoping on all
    //    content-types with an owners relation.  Web users must
    //    NOT access records they do not own through standard
    //    content-API endpoints.
    if (roleType === 'rutba_web_user') {
      const model = strapi.contentTypes[uid];
      const hasOwnerRelation =
        model?.attributes?.owners &&
        model.attributes.owners.target === 'plugin::users-permissions.user';

      if (hasOwnerRelation) {
        if (action === 'create') {
          const body = ctx.request.body;
          if (body?.data) {
            body.data.owners = { connect: [user.documentId || user.id] };
          } else if (body) {
            ctx.request.body = {
              ...body,
              data: { ...(body.data || {}), owners: { connect: [user.documentId || user.id] } },
            };
          }
        }

        if (action === 'find') {
          ctx.query = ctx.query || {};
          ctx.query.filters = ctx.query.filters || {};
          ctx.query.filters.owners = { id: { $eq: user.id } };
        }

        if (action === 'update' || action === 'delete') {
          const documentId = ctx.params?.id;
          if (documentId) {
            try {
              const record = await strapi.documents(uid).findOne({
                documentId,
                populate: { owners: { fields: ['id'] } },
              });
              if (!record) {
                return ctx.notFound('Record not found');
              }
              const owners = record.owners || [];
              const isOwner = Array.isArray(owners)
                ? owners.some((o) => o.id === user.id)
                : owners.id === user.id;
              if (!isOwner) {
                return ctx.forbidden('You can only modify your own records');
              }
            } catch (err) {
              strapi.log.error(`[app-access-guard] web-user ownership check failed for ${uid}/${documentId}: ${err.message}`);
              return ctx.forbidden('Ownership verification failed');
            }
          }
        }
      }

      return next();
    }

    if (roleType !== 'rutba_app_user') return next();

      /// ── b.2  Missing X-Rutba-App header → reject ─────────────
    const appName = (ctx.request.headers['x-rutba-app'] || '').trim().toLowerCase();

    if (!appName) {
      return ctx.forbidden('Missing X-Rutba-App header. All requests must identify the originating app.');
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬ b.3  Resolve access level Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    const hasAppAccess = appKeys.includes(appName);

    if (!hasAppAccess) {
      return ctx.forbidden(
        `Your account does not have "${appName}" app access.`
      );
    }

    // b.3.a  Elevation: admin bypass of owner scoping is only
    //        active when the client explicitly requests it via
    //        the X-Rutba-App-Admin header AND the user actually
    //        has admin_app_accesses for that specific app key.
    const elevationHeader = (ctx.request.headers['x-rutba-app-admin'] || '').trim().toLowerCase();
    const isElevated = elevationHeader && adminKeys.includes(elevationHeader);


    const model = strapi.contentTypes[uid];
    const hasOwnerRelation =
      model?.attributes?.owners &&
      model.attributes.owners.target === 'plugin::users-permissions.user';

    // -- Permission check (b.3.a & b.3.b) --------------------
    {
      const hasFind = hasPermissionViaKeys(appKeys, uid, 'find');
      const hasFindOne = hasPermissionViaKeys(appKeys, uid, 'findOne');
      const hasExact = hasPermissionViaKeys(appKeys, uid, action);

      // Elevated admins get full CRUD on entities that have no owners
      // relation (shared reference data like terms, branches, currencies),
      // as long as the entity appears in their app permissions at all.
      const elevatedOnShared =
        isElevated && !hasOwnerRelation && (hasFind || hasFindOne || hasExact);

      if (!elevatedOnShared) {
        if (action === 'find' && !hasFind && !hasFindOne) {
          return ctx.forbidden(
            'Your app-access permissions do not allow reading this resource.'
          );
        }
        if (action !== 'find' && !hasExact) {
          return ctx.forbidden(
            `Your app-access permissions do not allow "${action}" on this resource.`
          );
        }
      }
    }

    // -- b.3.b  Owner scoping ---------------------------------
    //    Applied to content-types with an `owners` relation,
    //    UNLESS the request is elevated (b.3.a).
    if (hasOwnerRelation && !isElevated) {

      if (action === 'create') {
        const body = ctx.request.body;
        if (body?.data) {
          body.data.owners = { connect: [user.documentId || user.id] };
        } else if (body) {
          ctx.request.body = {
            ...body,
            data: { ...(body.data || {}), owners: { connect: [user.documentId || user.id] } },
          };
        }
      }

      if (action === 'find') {
        ctx.query = ctx.query || {};
        ctx.query.filters = ctx.query.filters || {};
        ctx.query.filters.owners = { id: { $eq: user.id } };
      }

      if (action === 'update' || action === 'delete') {
        const documentId = ctx.params?.id;
        if (documentId) {
          try {
            const record = await strapi.documents(uid).findOne({
              documentId,
              populate: { owners: { fields: ['id'] } },
            });
            if (!record) {
              return ctx.notFound('Record not found');
            }
            const owners = record.owners || [];
            const isOwner = Array.isArray(owners)
              ? owners.some((o) => o.id === user.id)
              : owners.id === user.id;
            if (!isOwner) {
              return ctx.forbidden('You can only modify your own records');
            }
          } catch (err) {
            strapi.log.error(`[app-access-guard] ownership check failed for ${uid}/${documentId}: ${err.message}`);
            return ctx.forbidden('Ownership verification failed');
          }
        }
      }
    }

    return next();
  };
};
