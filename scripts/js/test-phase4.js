'use strict';

/**
 * Headless proof for Phase 4:
 *   1. Variant hierarchy guard — self-parent, child-bearing, and cycle updates
 *      are all rejected by the product beforeUpdate lifecycle.
 *   2. Seed single-flight — two concurrent runSeeds() calls: exactly one runs,
 *      the other is rejected with a 409. (Uses only:['__none__'] so no real
 *      seeder executes — this exercises the lock, not the seeders.)
 */

const path = require('path');
const APP_DIR = path.resolve(__dirname, '..', '..', 'pos-strapi');
const { compileStrapi, createStrapi } = require(require.resolve('@strapi/strapi', { paths: [APP_DIR] }));

const PRODUCT_UID = 'api::product.product';

let failures = 0;
function check(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures++;
}
async function expectThrow(name, fn) {
  try { await fn(); check(name, false, 'no error thrown'); }
  catch (e) { check(name, true, e.message.slice(0, 60)); }
}

(async () => {
  process.chdir(APP_DIR);
  const app = await createStrapi(await compileStrapi({ appDir: APP_DIR, distDir: path.join(APP_DIR, 'dist') })).load();
  const { runSeeds } = require(path.join(APP_DIR, 'src/seed/engine.js'));
  const cleanup = [];

  try {
    const stamp = 800000 + Math.floor(Number(process.pid) % 90000);
    const A = await app.documents(PRODUCT_UID).create({ data: { name: `__probe_var_A_${stamp}` } });
    const B = await app.documents(PRODUCT_UID).create({ data: { name: `__probe_var_B_${stamp}`, parent: A.documentId, is_variant: true } });
    const C = await app.documents(PRODUCT_UID).create({ data: { name: `__probe_var_C_${stamp}` } });
    cleanup.push(A.id, B.id, C.id);

    // A now has variant B. Guards:
    await expectThrow('self-parent rejected', () =>
      app.documents(PRODUCT_UID).update({ documentId: A.documentId, data: { parent: A.documentId } }));

    await expectThrow('child-bearing product cannot become a variant', () =>
      app.documents(PRODUCT_UID).update({ documentId: A.documentId, data: { parent: C.documentId } }));

    await expectThrow('cycle rejected (parent is a descendant)', () =>
      app.documents(PRODUCT_UID).update({ documentId: A.documentId, data: { parent: B.documentId } }));

    // A legitimate attach (C becomes a variant of B) must SUCCEED.
    try {
      await app.documents(PRODUCT_UID).update({ documentId: C.documentId, data: { parent: B.documentId, is_variant: true } });
      check('legitimate re-parent allowed', true);
    } catch (e) {
      check('legitimate re-parent allowed', false, e.message);
    }

    // ---- single-flight ----
    const [r1, r2] = await Promise.allSettled([
      runSeeds(app, { only: ['__none__'], source: 'test' }),
      runSeeds(app, { only: ['__none__'], source: 'test' }),
    ]);
    const blocked = [r1, r2].filter((r) => r.status === 'rejected' && (r.reason?.status === 409 || r.reason?.blocked));
    const ran = [r1, r2].filter((r) => r.status === 'fulfilled');
    check('single-flight: exactly one run proceeds', ran.length === 1 && blocked.length === 1,
      `ran=${ran.length}, blocked=${blocked.length}`);
  } catch (e) {
    console.error('test error:', e);
    failures++;
  } finally {
    for (const id of cleanup) { try { await app.db.query(PRODUCT_UID).delete({ where: { id } }); } catch (_) {} }
    await app.destroy();
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
