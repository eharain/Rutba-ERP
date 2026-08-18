#!/usr/bin/env node
'use strict';

/**
 * cms/social tranche smoke (tranche 5) against the live dev DB. Self-cleaning
 * and MARKER-ONLY: every row it writes carries the marker; temp app-role
 * grants are removed; the one test that touches real rows (site-setting
 * is_default invariant) snapshots the current default flags first and restores
 * them in the finally block. No provider API is ever called -- the social
 * checks exercise the failure paths that stop before any network I/O.
 *
 *  - documents shim: discardDraft (values + relation remap), pagination param,
 *    populate-level sort
 *  - cms-page: publish/unpublish/discard triad over HTTP, public by-slug read
 *    (published vs authed draft preview), seo-meta sidecar lifecycle
 *  - cms-menu: resolved public nav tree (nesting, ordering, draft exclusion)
 *  - site-setting: resolver (app_slug -> is_default -> first), marker-scoped
 *    publish/discard triad, is_default single-flag lifecycle
 *  - cms-bulk: admin gate, create/update dedup by natural key, deferred
 *    publish pass, SEO field split
 *  - seo-meta + social-account core-action overrides (interceptor-gated)
 *  - social-post: provider publish failure paths, duplicate, webhooks
 *    (verify handshake + signature fail-closed), CMS triad
 *  - crons: three social tasks registered (dormant)
 */

const jwt = require('jsonwebtoken');
const { get } = require('../src/config/env');
const { getDb, closeDb } = require('../src/db/connection');
const { documents } = require('../src/documents');
const { buildCompatStrapi } = require('../src/compat/strapi');
const { initModules } = require('../src/modules');
const { start } = require('../src/http/server');

const PORT = 4028;
const MARK = '__rutba_core_cms_smoke__';

const PAGE_UID = 'api::cms-page.cms-page';
const MENU_UID = 'api::cms-menu.cms-menu';
const ITEM_UID = 'api::cms-menu-item.cms-menu-item';
const SETTING_UID = 'api::site-setting.site-setting';
const SEO_UID = 'api::seo-meta.seo-meta';
const ACC_UID = 'api::social-account.social-account';
const POST_UID = 'api::social-post.social-post';

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log(`  PASS  ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ''}`); }
}

async function req(method, path, token, body, headers = {}) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, body: json, text, type: res.headers.get('content-type') || '' };
}

async function main() {
  const strapiC = buildCompatStrapi();
  initModules();

  const db = getDb();
  const created = [];
  const track = (uid, doc) => { if (doc && doc.documentId) created.push([uid, doc.documentId]); return doc; };
  const grants = [];
  let server = null;
  let realDefaultSettingIds = [];

  try {
    // Two plain users: no cms/social app-roles, not UP super-admins.
    const plain = await db('up_users as u')
      .leftJoin('up_users_role_lnk as rl', 'rl.user_id', 'u.id')
      .leftJoin('up_roles as r', 'r.id', 'rl.role_id')
      .where('u.blocked', 0)
      .where(function () { this.whereNull('r.type').orWhereNot('r.type', 'admin'); })
      .whereNotExists(function () {
        this.select(1).from('up_users_app_roles_lnk as l')
          .join('api_pro_app_roles as ar', 'ar.id', 'l.app_role_id')
          .whereRaw('l.user_id = u.id')
          .whereRaw("`ar`.`key` regexp '^(cms|social)_'");
      })
      .select('u.id', 'u.username')
      .limit(2);
    check('found two plain users', plain.length === 2, `got ${plain.length}`);
    const [userA, userB] = plain;

    // userB gets temp cms_admin + social_admin grants: the seeded policies for
    // seo-meta CRUD are cms_* and for social-account CRUD social_* (verified
    // against api_pro_method_policies), and requireAppAdmin('social') reads
    // the same app_roles from the DB.
    const adminRoles = await db('api_pro_app_roles').whereIn('key', ['cms_admin', 'social_admin']).select('id', 'key');
    check('cms_admin + social_admin app-roles exist', adminRoles.length === 2,
      JSON.stringify(adminRoles.map((r) => r.key)));
    for (const r of adminRoles) {
      await db('up_users_app_roles_lnk').insert({ user_id: userB.id, app_role_id: r.id });
      grants.push({ user_id: userB.id, app_role_id: r.id });
    }

    const tokenA = jwt.sign({ id: userA.id }, get('JWT_SECRET'), { expiresIn: '10m' });
    const tokenB = jwt.sign({ id: userB.id }, get('JWT_SECRET'), { expiresIn: '10m' });
    const tokenMember = tokenB;

    server = await start(PORT);

    // -- A. cms-page: sidecar lifecycle + triad + public reads --------------
    console.log('A. cms-page D&P triad + public by-slug');
    const p1 = track(PAGE_UID, await documents(PAGE_UID).create({
      data: { title: `${MARK} T1`, slug: `${MARK}-page`, page_type: 'info', excerpt: 'x' },
    }));
    const sidecar = await documents(SEO_UID).findMany({
      filters: { cms_page: { documentId: { $eq: p1.documentId } } },
    });
    check('afterCreate lifecycle built the seo-meta sidecar',
      sidecar.length === 1 && sidecar[0].entity_type === 'cms-page' && sidecar[0].entity_title === `${MARK} T1`,
      JSON.stringify(sidecar.map((s) => s.entity_title)));
    sidecar.forEach((s) => created.push([SEO_UID, s.documentId]));

    const pubNoAuth = await req('POST', `/api/cms-pages/${p1.documentId}/publish`);
    check('publish 401 without token', pubNoAuth.status === 401, `got ${pubNoAuth.status}`);

    const pub = await req('POST', `/api/cms-pages/${p1.documentId}/publish`, tokenA);
    check('publish 200 + returns published version', pub.status === 200 && pub.body && pub.body.publishedAt !== null,
      `status ${pub.status}`);

    const bySlug = await req('GET', `/api/cms-pages/public/by-slug/${MARK}-page`);
    check('public by-slug returns published page anonymously',
      bySlug.status === 200 && bySlug.body.data && bySlug.body.data.title === `${MARK} T1`,
      JSON.stringify(bySlug.body && bySlug.body.data && bySlug.body.data.title));

    await documents(PAGE_UID).update({ documentId: p1.documentId, data: { title: `${MARK} T2` } });
    const draftAnon = await req('GET', `/api/cms-pages/public/by-slug/${MARK}-page?draft=true`);
    check('draft preview requires auth', draftAnon.status === 401, `got ${draftAnon.status}`);
    const draftAuthed = await req('GET', `/api/cms-pages/public/by-slug/${MARK}-page?draft=true`, tokenA);
    check('draft preview returns the edited draft',
      draftAuthed.status === 200 && draftAuthed.body.data && draftAuthed.body.data.title === `${MARK} T2`);
    const stillPub = await req('GET', `/api/cms-pages/public/by-slug/${MARK}-page`);
    check('published read unaffected by draft edit',
      stillPub.body.data && stillPub.body.data.title === `${MARK} T1`);

    // discardDraft: values revert + relations remap to draft counterparts.
    const p2 = track(PAGE_UID, await documents(PAGE_UID).create({
      data: { title: `${MARK} rel`, slug: `${MARK}-rel`, page_type: 'info' },
    }));
    const p2seo = await documents(SEO_UID).findMany({ filters: { cms_page: { documentId: { $eq: p2.documentId } } } });
    p2seo.forEach((s) => created.push([SEO_UID, s.documentId]));
    await documents(PAGE_UID).publish({ documentId: p2.documentId });
    await documents(PAGE_UID).update({ documentId: p1.documentId, data: { related_pages: [p2.documentId] } });
    await documents(PAGE_UID).publish({ documentId: p1.documentId });
    await documents(PAGE_UID).update({ documentId: p1.documentId, data: { title: `${MARK} T3`, related_pages: [] } });

    const discarded = await req('POST', `/api/cms-pages/${p1.documentId}/discard-draft`, tokenA);
    check('discard-draft 200', discarded.status === 200, `got ${discarded.status}`);
    const draftAfter = await documents(PAGE_UID).findOne({
      documentId: p1.documentId, populate: { related_pages: true },
    });
    check('discard reverts draft values to the published copy',
      draftAfter && draftAfter.title === `${MARK} T2` && draftAfter.publishedAt === null,
      JSON.stringify(draftAfter && [draftAfter.title, draftAfter.publishedAt]));
    check('discard remaps relation links to draft counterparts',
      draftAfter && (draftAfter.related_pages || []).some((r) => r.documentId === p2.documentId && r.publishedAt === null),
      JSON.stringify(((draftAfter && draftAfter.related_pages) || []).map((r) => [r.documentId, r.publishedAt])));
    // Inbound repair: the sidecar's link row points at the draft page row that
    // discard just replaced — it must be re-pointed, not cascade-dropped.
    const sidecarAfter = await documents(SEO_UID).findMany({
      filters: { cms_page: { documentId: { $eq: p1.documentId } } },
    });
    check('inbound links (seo sidecar) survive discard-draft', sidecarAfter.length === 1,
      `got ${sidecarAfter.length}`);

    const unpub = await req('POST', `/api/cms-pages/${p1.documentId}/unpublish`, tokenA);
    check('unpublish 200', unpub.status === 200, `got ${unpub.status}`);
    const goneRead = await req('GET', `/api/cms-pages/public/by-slug/${MARK}-page`);
    check('public read null after unpublish', goneRead.status === 200 && goneRead.body.data === null,
      JSON.stringify(goneRead.body && goneRead.body.data));

    // pagination param support (shim addition for this tranche)
    const paged = await documents(PAGE_UID).findMany({
      filters: { slug: { $startsWith: MARK } }, pagination: { pageSize: 1 },
    });
    check('documents honors pagination: { pageSize }', paged.length === 1, `got ${paged.length}`);

    // -- B. cms-menu public tree --------------------------------------------
    console.log('B. cms-menu public nav tree');
    const menu = track(MENU_UID, await documents(MENU_UID).create({
      data: { name: `${MARK} menu`, slug: `${MARK}-menu`, position: 'top', enabled: true },
    }));
    await documents(MENU_UID).publish({ documentId: menu.documentId });
    const i1 = track(ITEM_UID, await documents(ITEM_UID).create({
      data: { label: `${MARK} One`, link_kind: 'url', url: 'https://one.test', order: 2, menu: menu.documentId },
    }));
    const i2 = track(ITEM_UID, await documents(ITEM_UID).create({
      data: { label: `${MARK} Two`, link_kind: 'url', url: 'https://two.test', order: 1, menu: menu.documentId },
    }));
    track(ITEM_UID, await documents(ITEM_UID).create({
      data: { label: `${MARK} DraftOnly`, link_kind: 'url', url: 'https://draft.test', order: 3, menu: menu.documentId },
    }));
    await documents(ITEM_UID).publish({ documentId: i1.documentId });
    await documents(ITEM_UID).publish({ documentId: i2.documentId });
    const c1 = track(ITEM_UID, await documents(ITEM_UID).create({
      data: { label: `${MARK} ChildB`, link_kind: 'url', url: 'https://cb.test', order: 2, parent: i1.documentId },
    }));
    const c2 = track(ITEM_UID, await documents(ITEM_UID).create({
      data: { label: `${MARK} ChildA`, link_kind: 'url', url: 'https://ca.test', order: 1, parent: i1.documentId },
    }));
    await documents(ITEM_UID).publish({ documentId: c1.documentId });
    await documents(ITEM_UID).publish({ documentId: c2.documentId });
    // Re-publish the parent AFTER its children exist as published versions so
    // its cloned links resolve (matches how editors publish bottom-up).
    await documents(ITEM_UID).publish({ documentId: i1.documentId });

    const tree = await req('GET', '/api/cms-menus/public');
    const markMenu = (tree.body.data || []).find((m) => m.slug === `${MARK}-menu`);
    check('public tree contains the marker menu (anonymous)', Boolean(markMenu), `status ${tree.status}`);
    check('items ordered + draft item excluded',
      markMenu && markMenu.items.length === 2
      && markMenu.items[0].label === `${MARK} Two` && markMenu.items[1].label === `${MARK} One`,
      JSON.stringify(markMenu && markMenu.items.map((i) => i.label)));
    const oneNode = markMenu && markMenu.items.find((i) => i.label === `${MARK} One`);
    check('one nested level of children resolved',
      oneNode && (oneNode.children || []).map((c) => c.label).join(',') === `${MARK} ChildA,${MARK} ChildB`,
      JSON.stringify(oneNode && oneNode.children));
    check('href resolved for url kind', oneNode && oneNode.href === 'https://one.test');
    check('menu with no page assignments is global', markMenu && markMenu.global === true);

    // populate-level sort override (shim addition for this tranche)
    const sorted = await documents(ITEM_UID).findOne({
      documentId: i1.documentId,
      populate: { children: { sort: ['order:desc'], fields: ['label', 'order'] } },
    });
    check('populate honors explicit sort',
      sorted && sorted.children.map((c) => c.order).join(',') === '2,1',
      JSON.stringify(sorted && sorted.children));

    // -- C. site-setting resolver + is_default lifecycle --------------------
    console.log('C. site-setting resolver');
    const anonSetting = await req('GET', '/api/site-setting');
    check('resolver answers anonymously', anonSetting.status === 200 && 'data' in (anonSetting.body || {}),
      `status ${anonSetting.status}`);

    track(SETTING_UID, await documents(SETTING_UID).create({
      data: { app_slug: `${MARK}-app`, site_name: `${MARK} site`, is_default: false },
    }));
    const byApp = await req('GET', `/api/site-setting?app=${MARK}-app`);
    check('resolver matches app_slug (draft fallback)',
      byApp.status === 200 && byApp.body.data && byApp.body.data.app_slug === `${MARK}-app`,
      JSON.stringify(byApp.body && byApp.body.data && byApp.body.data.app_slug));

    const pubSetting = await req('POST', `/api/site-setting/publish?app=${MARK}-app`, tokenA);
    check('site-setting publish (marker-scoped) 200',
      pubSetting.status === 200 && pubSetting.body.data && pubSetting.body.data.publishedAt !== null,
      `status ${pubSetting.status}`);
    const discSetting = await req('POST', `/api/site-setting/discard?app=${MARK}-app`, tokenA);
    check('site-setting discard (marker-scoped) 200', discSetting.status === 200, `status ${discSetting.status}`);
    const unpubSetting = await req('POST', `/api/site-setting/unpublish?app=${MARK}-app`, tokenA);
    check('site-setting unpublish (marker-scoped) 200', unpubSetting.status === 200, `status ${unpubSetting.status}`);

    // is_default single-flag invariant -- snapshot real defaults, restore in finally.
    realDefaultSettingIds = (await db('site_settings').where('is_default', 1).select('id')).map((r) => r.id);
    const s2 = track(SETTING_UID, await documents(SETTING_UID).create({
      data: { app_slug: `${MARK}-app2`, site_name: `${MARK} site2`, is_default: true },
    }));
    const flagged = await db('site_settings').where('is_default', 1).select('id');
    check('is_default lifecycle keeps the flag singular',
      flagged.length === 1 && flagged[0].id === s2.id,
      JSON.stringify({ flagged: flagged.map((r) => r.id), marker: s2.id }));

    // -- D. cms-bulk import -------------------------------------------------
    console.log('D. cms-bulk import');
    const bulkNoAuth = await req('POST', '/api/cms-bulk/import', null, { contentType: PAGE_UID, items: [] });
    check('bulk import 401 without token', bulkNoAuth.status === 401, `got ${bulkNoAuth.status}`);
    const bulkNoRole = await req('POST', '/api/cms-bulk/import', tokenA,
      { contentType: PAGE_UID, items: [] }, { 'x-rutba-app-role': 'web_customer' });
    check('bulk import 403 without an admin role header', bulkNoRole.status === 403, `got ${bulkNoRole.status}`);

    const bulkRun = await req('POST', '/api/cms-bulk/import', tokenA, {
      contentType: PAGE_UID,
      items: [
        { title: `${MARK} bulk1`, slug: `${MARK}-b1`, page_type: 'info', meta_title: `${MARK} MT`, publish: true },
        { title: `${MARK} bulk2`, slug: `${MARK}-b2`, page_type: 'info' },
      ],
    }, { 'x-rutba-app-role': 'cms_admin' });
    check('bulk import creates rows + runs the deferred publish pass',
      bulkRun.status === 200 && bulkRun.body.created === 2 && bulkRun.body.published === 1
      && bulkRun.body.failed.length === 0,
      JSON.stringify(bulkRun.body));

    const b1 = (await documents(PAGE_UID).findMany({ filters: { slug: { $eq: `${MARK}-b1` } } }))[0];
    const b2 = (await documents(PAGE_UID).findMany({ filters: { slug: { $eq: `${MARK}-b2` } } }))[0];
    if (b1) created.push([PAGE_UID, b1.documentId]);
    if (b2) created.push([PAGE_UID, b2.documentId]);
    const b1pub = b1 && await documents(PAGE_UID).findOne({ documentId: b1.documentId, status: 'published' });
    const b2pub = b2 && await documents(PAGE_UID).findOne({ documentId: b2.documentId, status: 'published' });
    check('publish directive honored per row', Boolean(b1pub) && !b2pub);
    const b1seo = b1 && (await documents(SEO_UID).findMany({
      filters: { cms_page: { documentId: { $eq: b1.documentId } } },
    }))[0];
    if (b1seo) created.push([SEO_UID, b1seo.documentId]);
    const b2seo = b2 && (await documents(SEO_UID).findMany({
      filters: { cms_page: { documentId: { $eq: b2.documentId } } },
    }))[0];
    if (b2seo) created.push([SEO_UID, b2seo.documentId]);
    check('SEO fields split into the sidecar', b1seo && b1seo.meta_title === `${MARK} MT`,
      JSON.stringify(b1seo && b1seo.meta_title));

    const bulkAgain = await req('POST', '/api/cms-bulk/import', tokenA, {
      contentType: PAGE_UID,
      items: [{ title: `${MARK} bulk2b`, slug: `${MARK}-b2` }],
    }, { 'x-rutba-app-role': 'cms_admin' });
    check('re-import dedups by natural key (slug)',
      bulkAgain.status === 200 && bulkAgain.body.updated === 1 && bulkAgain.body.created === 0,
      JSON.stringify(bulkAgain.body));

    // -- E. seo-meta core-action override (interceptor-gated) ---------------
    console.log('E. seo-meta override');
    // Parity note: a CLAIMLESS authenticated request (no x-rutba-app header)
    // is skipped by the interceptor in BOTH servers — enforcement kicks in only
    // once a claim is presented. The plain-user 403 case is covered by
    // social-account below, whose controller gates itself.
    const seoClaimless = await req('POST', '/api/seo-metas', tokenA,
      { data: { entity_type: 'cms-page', meta_title: `${MARK} claimless` } });
    check('seo-meta create skipped-through for a claimless request (parity)',
      seoClaimless.status === 201, `got ${seoClaimless.status}`);
    if (seoClaimless.body && seoClaimless.body.data) created.push([SEO_UID, seoClaimless.body.data.documentId]);

    const seoCreate = await req('POST', '/api/seo-metas', tokenB,
      { data: { entity_type: 'cms-page-group', meta_title: `${MARK} sm` } },
      { 'x-rutba-app': 'cms', 'x-rutba-app-role': 'cms_admin' });
    check('seo-meta create 201 under an enforced cms_admin claim',
      seoCreate.status === 201 && seoCreate.body.data.documentId,
      `status ${seoCreate.status}`);
    if (seoCreate.body && seoCreate.body.data) created.push([SEO_UID, seoCreate.body.data.documentId]);
    const seoUpd = seoCreate.body.data && await req('PUT', `/api/seo-metas/${seoCreate.body.data.documentId}`, tokenB,
      { data: { meta_title: `${MARK} sm2` } });
    check('seo-meta update 200 via override', seoUpd && seoUpd.status === 200, seoUpd && `status ${seoUpd.status}`);

    // entity_title refresh: the after-write hook re-reads the linked page and
    // denormalises its title.
    const seoLink = await req('PUT', `/api/seo-metas/${b1seo.documentId}`, tokenB,
      { data: { meta_description: 'refreshed' } });
    const b1seoAfter = await documents(SEO_UID).findOne({ documentId: b1seo.documentId });
    check('entity_title denormalised from the linked page',
      seoLink.status === 200 && b1seoAfter && b1seoAfter.entity_title === `${MARK} bulk1`,
      JSON.stringify(b1seoAfter && b1seoAfter.entity_title));

    // -- F. social-account overrides + probes -------------------------------
    console.log('F. social-account');
    const accDenied = await req('POST', '/api/social-accounts', tokenA,
      { data: { platform: 'facebook', account_name: `${MARK} acc` } });
    check('account create denied for a plain user', accDenied.status === 403, `got ${accDenied.status}`);

    const accCreate = await req('POST', '/api/social-accounts', tokenB,
      { data: { platform: 'facebook', account_name: `${MARK} acc`, is_active: false } });
    check('account create 201 via override (social_admin gate)',
      accCreate.status === 201 && accCreate.body.data.documentId, `status ${accCreate.status}`);
    const accDoc = accCreate.body.data.documentId;
    created.push([ACC_UID, accDoc]);

    const accUpd = await req('PUT', `/api/social-accounts/${accDoc}`, tokenB,
      { data: { account_name: `${MARK} acc2` } });
    check('account update 200 via override', accUpd.status === 200, `status ${accUpd.status}`);

    const provStatus = await req('GET', '/api/social-accounts/provider-status', tokenB);
    check('provider-status reports per-platform booleans only',
      provStatus.status === 200 && typeof provStatus.body.platforms === 'object'
      && typeof provStatus.body.platforms.facebook === 'boolean',
      JSON.stringify(provStatus.body));

    const validate = await req('POST', `/api/social-accounts/${accDoc}/validate-connection`, tokenB, {});
    check('validate-connection: no token -> ok:false with reason',
      validate.status === 200 && validate.body.ok === false && /access token/i.test(validate.body.reason || ''),
      JSON.stringify(validate.body));

    const badCallback = await req('GET', '/api/social-accounts/oauth/callback?state=bogus.nonce&code=x');
    check('oauth callback renders the popup-closer HTML on failure',
      badCallback.status === 200 && /html/.test(badCallback.type) && /apps/content/social-oauth/.test(badCallback.text),
      `status ${badCallback.status} type ${badCallback.type}`);

    // -- G. social-post ------------------------------------------------------
    console.log('G. social-post');
    const post = track(POST_UID, await documents(POST_UID).create({
      data: { title: `${MARK} post`, body: 'hello', platforms: ['facebook'], post_status: 'draft' },
    }));

    const pubDenied = await req('POST', `/api/social-posts/${post.documentId}/publish-social`, tokenA);
    check('publish-social denied without a social app-role', pubDenied.status === 403, `got ${pubDenied.status}`);

    const pubSocial = await req('POST', `/api/social-posts/${post.documentId}/publish-social`, tokenMember);
    check('publish-social records per-platform failure (no linked account)',
      pubSocial.status === 200 && pubSocial.body.post_status === 'failed' && pubSocial.body.successes === 0,
      JSON.stringify(pubSocial.body && [pubSocial.body.post_status, pubSocial.body.successes]));

    const replies = await req('GET', `/api/social-posts/${post.documentId}/replies`, tokenA);
    check('replies list empty', replies.status === 200 && Array.isArray(replies.body.data) && replies.body.data.length === 0,
      JSON.stringify(replies.body));

    const noBody = await req('POST', `/api/social-posts/${post.documentId}/reply`, tokenMember, { data: { body: '' } });
    check('reply without body -> 400', noBody.status === 400, `got ${noBody.status}`);
    const notPublished = await req('POST', `/api/social-posts/${post.documentId}/reply`, tokenMember,
      { data: { body: 'hi', accountDocumentId: accDoc } });
    check('reply on an unpublished target -> 400',
      notPublished.status === 400 && /not been published/i.test((notPublished.body.error || {}).message || ''),
      JSON.stringify(notPublished.body));

    const dup = await req('POST', `/api/social-posts/${post.documentId}/duplicate`, tokenMember);
    check('duplicate clones a fresh draft',
      dup.status === 200 && dup.body.data && /\(repost\)$/.test(dup.body.data.title)
      && dup.body.data.post_status === 'draft',
      JSON.stringify(dup.body && dup.body.data && dup.body.data.title));
    if (dup.body && dup.body.data) created.push([POST_UID, dup.body.data.documentId]);

    const verifyToken = (strapiC.config.get('social') || {}).webhookVerifyToken;
    const hook = await req('GET',
      `/api/social-posts/webhook/facebook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=c123`);
    check('webhook verify handshake echoes the challenge', hook.status === 200 && hook.text === 'c123',
      `status ${hook.status} text ${hook.text}`);
    const hookBad = await req('GET', '/api/social-posts/webhook/facebook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=x');
    check('webhook verify rejects a wrong token', hookBad.status === 403, `got ${hookBad.status}`);
    const hookRecv = await req('POST', '/api/social-posts/webhook/facebook', null, { entry: [] });
    check('webhook receive fails closed without a valid signature', hookRecv.status === 403, `got ${hookRecv.status}`);

    const postPub = await req('POST', `/api/social-posts/${post.documentId}/publish`, tokenA);
    check('social-post CMS publish 200', postPub.status === 200 && postPub.body.publishedAt !== null,
      `status ${postPub.status}`);
    const postUnpub = await req('POST', `/api/social-posts/${post.documentId}/unpublish`, tokenA);
    check('social-post CMS unpublish 200', postUnpub.status === 200, `status ${postUnpub.status}`);

    // -- H. crons registered (dormant) --------------------------------------
    const { tasks } = require('../src/platform/cron');
    check('social crons registered with services/strapi rules',
      tasks.has('socialPublishScheduled') && tasks.get('socialPublishScheduled').rule === '* * * * *'
      && tasks.has('socialSyncReplies') && tasks.get('socialSyncReplies').rule === '*/10 * * * *'
      && tasks.has('socialRefreshTokens') && tasks.get('socialRefreshTokens').rule === '0 */6 * * *');
  } finally {
    // Restore real site-setting default flags before deleting markers.
    try {
      await db('site_settings').where('is_default', 1).update({ is_default: 0 });
      if (realDefaultSettingIds.length) {
        await db('site_settings').whereIn('id', realDefaultSettingIds).update({ is_default: 1 });
      }
    } catch {}
    for (const [uid, documentId] of created.reverse()) {
      try { await documents(uid).delete({ documentId }); } catch {}
    }
    for (const g of grants) {
      try { await db('up_users_app_roles_lnk').where(g).del(); } catch {}
    }
    if (server) server.close();
    await closeDb();
  }

  console.log(failures === 0 ? `\nALL PASS` : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error('SMOKE ERROR:', e.stack);
  try { await closeDb(); } catch {}
  process.exit(1);
});
