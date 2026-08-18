'use strict';

/**
 * Rewrite the storefront product URLs inside social-post captions to short
 * links: `<origin>/product/<slug>` → `<origin>/s/<base32(product.id)>`.
 *
 * Each URL keeps the origin it was written with. Post bodies are content, not
 * schema, and every environment holds a different set of them with a different
 * storefront baked in — the LAN box's posts say `http://192.168.0.46:4000`,
 * localhost's say `http://localhost:4000`. Preserving the origin means running
 * this against a database fixes that database's own links, with no assumption
 * about which host "the" storefront is and no cross-environment rewriting to
 * get wrong. It is therefore run once per environment, against each one's DB.
 *
 * Why direct knex rather than the API or an in-process Strapi:
 *
 *   - social-post is draft & publish, so each post is TWO rows sharing a
 *     document_id, and the desktop poster reads the published one. Going
 *     through the API would mean updating the draft then calling publish, which
 *     also pushes any *unrelated* pending draft edit live — the exact hazard
 *     services/strapi/src/api/social-post/services/social-post.js:247 documents and
 *     sidesteps by writing the published row directly. Updating rows by id does
 *     the same: a draft stays a draft, and a published caption is corrected
 *     without republishing anything.
 *   - booting a second Strapi to do it would run content-type schema sync
 *     against a database another backend is already serving. Not worth it to
 *     rewrite a text column on a table with no lifecycles.
 *
 *   node scripts/shorten-social-post-urls.js                  # dry run (default)
 *   node scripts/shorten-social-post-urls.js --apply          # write + back up
 *   node scripts/shorten-social-post-urls.js --restore=<file> # undo exactly
 *   node scripts/shorten-social-post-urls.js --verbose        # show every URL
 *
 * From the repo root:  npm --prefix services/core run social:shorten-urls
 * On the LAN box, the same command over SSH against that checkout.
 *
 * Idempotent: a second run finds no `/product/` URLs left to shorten.
 * Only `/product/<key>` URLs are touched — `/shop`, `/product-groups/<slug>`
 * and CMS links are left alone, because `/s/` is a product-id namespace and has
 * nothing to encode them as.
 */

const fs = require('fs');
const path = require('path');
const { getDb, closeDb } = require('../src/db/connection');
// By path, not by package specifier: services/core is not an npm workspace member
// and declares no @rutba/* dependency, so the bare specifier would only resolve
// by accident of root hoisting. Reaching across the repo by path is what
// src/compat/strapi.js already does for services/strapi.
const { shortLinkPath } = require('../../../packages/api-provider/lib/short-code.cjs');

const BACKUP_DIR = path.join(__dirname, '..', '.tmp', 'social-url-backups');

// Absolute http(s) URLs only. A bare `/product/x` in a caption is not a working
// link on any platform, so rewriting one would be inventing intent rather than
// shortening a link.
const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;

// Sentence punctuation that commonly abuts a URL in prose and is not part of
// it. Split off before parsing and re-attached after.
const TRAILING_RE = /^(.*?)([.,;:!?)\]}]*)$/s;

function parseArgs(argv) {
  const args = { apply: false, verbose: false, restore: null };
  for (const arg of argv.slice(2)) {
    if (arg === '--apply') args.apply = true;
    else if (arg === '--verbose' || arg === '-v') args.verbose = true;
    else if (arg === '--dry-run') args.apply = false;
    else if (arg.startsWith('--restore=')) args.restore = arg.slice('--restore='.length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

/**
 * slug/document_id → numeric product id.
 *
 * Draft & publish means two rows per product with different ids and often
 * different slugs (a renamed product whose draft was never published). Every
 * slug seen is indexed so an older caption still resolves, but all of them map
 * to the *published* row's id where one exists: the resolver can reach a
 * product from either id, and the published one costs it a single query instead
 * of three.
 */
function buildProductIndex(rows) {
  const publishedIdByDocument = new Map();
  for (const row of rows) {
    if (row.published_at && row.document_id) publishedIdByDocument.set(row.document_id, row.id);
  }

  const index = new Map();
  const put = (key, id) => {
    if (key) index.set(String(key), id);
  };
  for (const row of rows) {
    const id = publishedIdByDocument.get(row.document_id) ?? row.id;
    put(row.slug, id);
    put(row.document_id, id);
  }
  return index;
}

/**
 * @returns {{ body: string, rewritten: string[], unresolved: string[] }}
 */
function shortenBody(body, index) {
  const rewritten = [];
  const unresolved = [];

  const next = String(body).replace(URL_RE, (raw) => {
    const [, candidate, trailing] = raw.match(TRAILING_RE);

    let url;
    try {
      url = new URL(candidate);
    } catch {
      return raw;
    }

    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length !== 2 || segments[0] !== 'product') return raw;

    let key;
    try {
      key = decodeURIComponent(segments[1]);
    } catch {
      key = segments[1];
    }

    const id = index.get(key);
    if (id == null) {
      // A deleted product, or a slug from before a rename with no row left
      // carrying it. Leaving the long URL alone preserves whatever behaviour it
      // has today; turning it into a short link would guarantee a dead one.
      unresolved.push(key);
      return raw;
    }

    url.pathname = shortLinkPath(id);
    // toString keeps ?query and #hash — the /s/ route forwards the query onto
    // its redirect, so campaign tags survive the shortening.
    const shortened = url.toString() + trailing;
    rewritten.push(`${raw} → ${shortened}`);
    return shortened;
  });

  return { body: next, rewritten, unresolved };
}

async function restore(db, file) {
  const entries = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const entry of entries) {
    await db('social_posts').where({ id: entry.id }).update({ body: entry.body, updated_at: new Date() });
  }
  console.log(`Restored ${entries.length} row(s) from ${file}`);
}

async function main() {
  const args = parseArgs(process.argv);
  const db = getDb();

  try {
    if (args.restore) return await restore(db, args.restore);

    const products = await db('products').select('id', 'document_id', 'slug', 'published_at');
    const index = buildProductIndex(products);

    // Both versions of every post: the draft is what an editor reopens, the
    // published row is what the desktop poster actually posts.
    const posts = await db('social_posts').select('id', 'document_id', 'body', 'published_at').orderBy('id');

    const backup = [];
    const unresolved = new Map();
    let urlCount = 0;

    for (const post of posts) {
      if (!post.body) continue;
      const result = shortenBody(post.body, index);
      for (const key of result.unresolved) unresolved.set(key, (unresolved.get(key) ?? 0) + 1);
      if (!result.rewritten.length) continue;

      urlCount += result.rewritten.length;
      backup.push({ id: post.id, document_id: post.document_id, body: post.body });

      const version = post.published_at ? 'published' : 'draft';
      console.log(`${args.apply ? 'rewrite' : 'would rewrite'} ${post.document_id} (${version}, row ${post.id}) — ${result.rewritten.length} url(s)`);
      if (args.verbose) for (const line of result.rewritten) console.log(`    ${line}`);

      if (args.apply) {
        await db('social_posts').where({ id: post.id }).update({ body: result.body, updated_at: new Date() });
      }
    }

    if (args.apply && backup.length) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      // Colons are illegal in Windows filenames; this runs on the dev machine
      // as well as the Linux box.
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = path.join(BACKUP_DIR, `social-post-bodies-${stamp}.json`);
      fs.writeFileSync(file, JSON.stringify(backup, null, 2));
      console.log(`\nBackup of ${backup.length} original row(s): ${file}`);
      console.log(`Undo with: node scripts/shorten-social-post-urls.js --restore="${file}"`);
    }

    console.log(`\n${args.apply ? 'Rewrote' : 'Would rewrite'} ${urlCount} url(s) across ${backup.length} row(s) of ${posts.length} scanned (${index.size} product keys indexed).`);

    if (unresolved.size) {
      console.log(`\nLeft alone — no product matches these keys:`);
      for (const [key, count] of unresolved) console.log(`  ${key} (${count}×)`);
    }
    if (!args.apply && urlCount) console.log(`\nDry run. Re-run with --apply to write.`);
  } finally {
    await closeDb();
  }
}

// Booting a DB connection to check a regex is a bad trade, so the two pure
// functions are exported and the entrypoint only runs as the process entry.
module.exports = { buildProductIndex, shortenBody };

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
